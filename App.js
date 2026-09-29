import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, SafeAreaView, StatusBar, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_SHEETS_API_URL || '';
const TOKEN = process.env.EXPO_PUBLIC_SHEETS_TOKEN || '';
const STORAGE_KEY = 'comnam-inventory-v1';
const UNIT_PRICE = 17000;
const PRODUCTS = [
  { key: 'ga', label: 'Cơm nắm gà' },
  { key: 'bo', label: 'Cơm nắm bò' },
  { key: 'phomai', label: 'Cơm nắm Phô mai xúc xích' },
  { key: 'cahoi', label: 'Cơm nắm Cá hồi' },
  { key: 'cangu', label: 'Cơm nắm cá ngừ' },
  { key: 'thanhcua', label: 'Cơm nắm Thanh Cua' },
];
const PAYMENTS = ['Tiền mặt', 'Chuyển khoản'];
const emptyQty = () => Object.fromEntries(PRODUCTS.map(p => [p.key, 0]));
const newOrderId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const formatMoney = value => `${value.toLocaleString('vi-VN')}đ`;
const emptyInventory = () => ({ stock: emptyQty(), sold: emptyQty() });

export default function App() {
  const [qty, setQty] = useState(emptyQty());
  const [payment, setPayment] = useState(null);
  const [inventory, setInventory] = useState(emptyInventory());
  const [draftStock, setDraftStock] = useState(emptyQty());
  const [screen, setScreen] = useState('order');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [banner, setBanner] = useState(null);
  const orderId = useRef(newOrderId());
  const busy = useRef(false);
  const scroller = useRef(null);
  const timer = useRef(null);
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const remainingFor = key => Math.max(0, (inventory.stock[key] || 0) - (inventory.sold[key] || 0));
  const totalStock = Object.values(inventory.stock).reduce((a, b) => a + b, 0);
  const totalRemaining = PRODUCTS.reduce((sum, p) => sum + remainingFor(p.key), 0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (value) {
          const saved = JSON.parse(value);
          const clean = emptyInventory();
          PRODUCTS.forEach(p => {
            clean.stock[p.key] = Number.isInteger(saved.stock?.[p.key]) && saved.stock[p.key] >= 0 ? saved.stock[p.key] : 0;
            clean.sold[p.key] = Number.isInteger(saved.sold?.[p.key]) && saved.sold[p.key] >= 0 ? saved.sold[p.key] : 0;
          });
          setInventory(clean);
          setDraftStock({ ...clean.stock });
        }
      })
      .catch(() => show('err', 'Không đọc được dữ liệu tồn kho đã lưu trên thiết bị.'))
      .finally(() => setReady(true));
    return () => clearTimeout(timer.current);
  }, []);

  const show = (type, text) => {
    clearTimeout(timer.current);
    setBanner({ type, text });
    if (type === 'ok') timer.current = setTimeout(() => setBanner(null), 3500);
  };

  const change = (key, delta) => {
    if (delta > 0 && qty[key] >= remainingFor(key)) {
      return show('err', `Cơm nắm ${PRODUCTS.find(p => p.key === key).label.replace('Cơm nắm ', '')} đã hết tồn.`);
    }
    setQty(current => ({ ...current, [key]: Math.max(0, current[key] + delta) }));
    setBanner(null);
  };

  const saveStock = async () => {
    const stock = {};
    for (const product of PRODUCTS) {
      const raw = draftStock[product.key] ?? '';
      const amount = raw === '' ? 0 : Number(raw);
      if (!Number.isInteger(amount) || amount < 0) {
        return show('err', `Số lượng ${product.label} phải là số nguyên không âm.`);
      }
      const alreadyCommitted = (inventory.sold[product.key] || 0) + qty[product.key];
      if (amount < alreadyCommitted) {
        return show('err', `Tổng tồn ${product.label} không thể thấp hơn số đã bán và đang chọn (${alreadyCommitted}).`);
      }
      stock[product.key] = amount;
    }
    const next = { ...inventory, stock };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setInventory(next);
      setDraftStock({ ...stock });
      setBanner(null);
      setScreen('order');
    } catch (_) {
      show('err', 'Không lưu được cài đặt tồn kho trên thiết bị. Vui lòng thử lại.');
    }
  };

  const submit = async () => {
    if (busy.current) return;
    if (total <= 0) return show('err', 'Vui lòng chọn ít nhất 1 cơm nắm.');
    if (!payment) return show('err', 'Vui lòng chọn phương thức thanh toán.');
    if (!API_URL || !TOKEN) return show('err', 'Chưa cấu hình kết nối Google Sheets. Hãy xem README.');

    busy.current = true;
    setLoading(true);
    setBanner(null);
    const orderQty = { ...qty };
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: TOKEN, orderId: orderId.current, items: orderQty, payment, unitPrice: UNIT_PRICE }),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Máy chủ phản hồi ${res.status}`);

      const next = { ...inventory, sold: { ...inventory.sold } };
      PRODUCTS.forEach(p => { next.sold[p.key] = (next.sold[p.key] || 0) + orderQty[p.key]; });
      setInventory(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      setQty(emptyQty());
      setPayment(null);
      orderId.current = newOrderId();
      scroller.current?.scrollTo({ y: 0, animated: true });
      show('ok', 'Đã lưu đơn hàng thành công!');
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Quá thời gian chờ.' : (e.message || 'Lỗi kết nối');
      show('err', `Không lưu được đơn: ${msg} Vui lòng thử lại.`);
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      setLoading(false);
    }
  };

  const openSettings = () => {
    setDraftStock({ ...inventory.stock });
    setBanner(null);
    setScreen('settings');
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={s.topbar}>
        {screen === 'settings' ? (
          <TouchableOpacity style={s.navButton} onPress={() => { setBanner(null); setScreen('order'); }}>
            <Text style={s.navText}>‹ Đơn hàng</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.brand}>🍙 CƠM NẮM</Text>
        )}
        {screen === 'order' && (
          <TouchableOpacity style={s.settingsButton} onPress={openSettings} disabled={!ready || loading}>
            <Text style={s.settingsText}>⚙ Cài đặt</Text>
          </TouchableOpacity>
        )}
      </View>

      {screen === 'settings' ? (
        <>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.eyebrow}>QUẢN LÝ TỒN KHO</Text>
            <Text style={s.title}>Cài đặt số lượng cơm</Text>
            <Text style={s.subtitle}>Nhập tổng số lượng ban đầu của từng loại. Tồn còn lại sẽ tự trừ theo đơn đã lưu trên thiết bị này.</Text>
            {banner && <View style={[s.banner, banner.type === 'ok' ? s.ok : s.err]}><Text style={s.bannerText}>{banner.text}</Text></View>}
            {PRODUCTS.map(p => (
              <View key={p.key} style={s.settingRow}>
                <View style={s.settingLabelWrap}>
                  <Text style={s.label}>{p.label}</Text>
                  <Text style={s.stockHint}>Đã bán: {inventory.sold[p.key] || 0} · Còn: {remainingFor(p.key)}</Text>
                </View>
                <TextInput
                  style={s.stockInput}
                  value={String(draftStock[p.key] ?? '')}
                  onChangeText={value => setDraftStock(current => ({ ...current, [p.key]: value.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  accessibilityLabel={`Tổng số lượng ${p.label}`}
                />
              </View>
            ))}
            <View style={s.stockSummary}>
              <Text style={s.summaryLabel}>Tổng số lượng ban đầu</Text>
              <Text style={s.summaryValue}>{PRODUCTS.reduce((sum, p) => sum + (Number(draftStock[p.key]) || 0), 0)}</Text>
            </View>
          </ScrollView>
          <View style={s.footer}>
            <TouchableOpacity style={s.submit} onPress={saveStock} disabled={!ready}>
              <Text style={s.submitText}>Lưu cài đặt</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <ScrollView ref={scroller} contentContainerStyle={s.content}>
            <Text style={s.eyebrow}>ĐƠN HÀNG MỚI</Text>
            <Text style={s.title}>Ghi đơn cơm nắm</Text>
            <Text style={s.subtitle}>Chọn số lượng từng món</Text>
            {banner && <View style={[s.banner, banner.type === 'ok' ? s.ok : s.err]}><Text style={s.bannerText}>{banner.text}</Text></View>}
            <View style={s.inventorySummary}>
              <View><Text style={s.summaryLabel}>Cơm còn lại</Text><Text style={s.inventoryValue}>{ready ? totalRemaining : '…'} <Text style={s.inventoryUnit}>/ {totalStock} phần</Text></Text></View>
              <TouchableOpacity onPress={openSettings} disabled={!ready || loading}><Text style={s.editLink}>Sửa tồn kho</Text></TouchableOpacity>
            </View>
            {PRODUCTS.map(p => (
              <View key={p.key} style={s.row}>
                <View style={s.productInfo}>
                  <Text style={s.label}>{p.label}</Text>
                  <Text style={s.stockHint}>Còn {ready ? remainingFor(p.key) : '…'}</Text>
                </View>
                <View style={s.stepper}>
                  <TouchableOpacity style={[s.stepBtn, (qty[p.key] === 0 || loading) && s.stepDisabled]} onPress={() => change(p.key, -1)} disabled={loading || qty[p.key] === 0}><Text style={s.stepText}>−</Text></TouchableOpacity>
                  <Text style={s.qty}>{qty[p.key]}</Text>
                  <TouchableOpacity style={[s.stepBtn, (loading || !ready || qty[p.key] >= remainingFor(p.key)) && s.stepDisabled]} onPress={() => change(p.key, 1)} disabled={loading || !ready || qty[p.key] >= remainingFor(p.key)}><Text style={s.stepText}>+</Text></TouchableOpacity>
                </View>
              </View>
            ))}
            <Text style={s.section}>Phương thức thanh toán</Text>
            {PAYMENTS.map(method => (
              <TouchableOpacity key={method} style={[s.pay, payment === method && s.paySelected]} onPress={() => setPayment(method)} disabled={loading}>
                <View style={[s.radio, payment === method && s.radioOn]}>{payment === method && <View style={s.dot} />}</View>
                <Text style={s.payText}>{method}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.footer}>
            <View style={s.billRow}><Text style={s.total}>Tổng số lượng</Text><Text style={s.totalNum}>{total} phần</Text></View>
            <View style={s.billRow}><Text style={s.priceLabel}>Đơn giá · {formatMoney(UNIT_PRICE)}/phần</Text><Text style={s.priceValue}>{formatMoney(total * UNIT_PRICE)}</Text></View>
            <TouchableOpacity style={[s.submit, loading && s.submitLoading]} onPress={submit} disabled={loading || !ready} activeOpacity={0.8}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Xác nhận đơn · {formatMoney(total * UNIT_PRICE)}</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const G = '#2e7d32';
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f2' },
  topbar: { height: 52, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 13, letterSpacing: 1.4, fontWeight: '800', color: G },
  settingsButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#e8f1e5' },
  settingsText: { color: G, fontSize: 14, fontWeight: '700' },
  navButton: { paddingVertical: 8, paddingRight: 12 },
  navText: { color: G, fontSize: 16, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 28 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, fontWeight: '800', color: G, marginTop: 4 },
  title: { fontSize: 25, fontWeight: '800', marginTop: 6, color: '#1f2a1f' },
  subtitle: { fontSize: 15, lineHeight: 21, color: '#6c756a', marginTop: 5, marginBottom: 16 },
  banner: { padding: 12, borderRadius: 10, marginBottom: 12 },
  ok: { backgroundColor: '#e3f4e4' }, err: { backgroundColor: '#fde8e8' },
  bannerText: { fontSize: 15, fontWeight: '600', color: '#222' },
  inventorySummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e8f1e5', padding: 14, borderRadius: 16, marginBottom: 12 },
  summaryLabel: { fontSize: 13, color: '#64715f', fontWeight: '600' },
  inventoryValue: { color: G, fontSize: 24, fontWeight: '800', marginTop: 2 },
  inventoryUnit: { fontSize: 14, color: '#64715f', fontWeight: '500' },
  editLink: { color: G, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#edf0e9' },
  productInfo: { flex: 1, paddingRight: 6 },
  label: { flex: 1, fontSize: 16, color: '#222', paddingRight: 8 },
  stockHint: { fontSize: 12, color: '#778071', marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: G, alignItems: 'center', justifyContent: 'center' },
  stepDisabled: { backgroundColor: '#c8c8c8' },
  stepText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '600' },
  qty: { minWidth: 40, textAlign: 'center', fontSize: 23, fontWeight: '700', color: '#222' },
  section: { fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 8, color: '#222' },
  pay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 9, borderWidth: 2, borderColor: 'transparent' },
  paySelected: { borderColor: G },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#999', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  radioOn: { borderColor: G }, dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: G },
  payText: { fontSize: 17, color: '#222' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: '#edf0e9' },
  settingLabelWrap: { flex: 1 },
  stockInput: { width: 82, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#dce3d7', textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#222', backgroundColor: '#fafff7' },
  stockSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 14 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: G },
  footer: { padding: 15, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  total: { fontSize: 16, color: '#30382f' },
  totalNum: { fontWeight: '800', fontSize: 17, color: G },
  priceLabel: { fontSize: 14, color: '#6c756a' },
  priceValue: { fontSize: 20, color: '#1f2a1f', fontWeight: '800' },
  submit: { height: 58, borderRadius: 16, backgroundColor: G, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitLoading: { backgroundColor: '#7fb383' },
  submitText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
