import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CircleHelp,
  History,
  Image as ImageIcon,
  Info,
  Menu,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

const assetPath = (path) => `${import.meta.env.BASE_URL}${path}`;
const sampleMealPath = assetPath("assets/sample-meal.png");

const energyTargets = {
  male: {
    "18-29": { low: 2250, normal: 2600, high: 3000 },
    "30-49": { low: 2350, normal: 2750, high: 3150 },
    "50-64": { low: 2250, normal: 2650, high: 3000 },
    "65-74": { low: 2100, normal: 2350, high: 2650 },
    "75+": { low: 1850, normal: 2250, high: 2250 },
  },
  female: {
    "18-29": { low: 1700, normal: 1950, high: 2250 },
    "30-49": { low: 1750, normal: 2050, high: 2350 },
    "50-64": { low: 1700, normal: 1950, high: 2250 },
    "65-74": { low: 1650, normal: 1850, high: 2050 },
    "75+": { low: 1450, normal: 1750, high: 1750 },
  },
};

const sexOptions = [
  { value: "male", label: "成人男性" },
  { value: "female", label: "成人女性" },
];

const ageOptions = [
  { value: "18-29", label: "18-29歳" },
  { value: "30-49", label: "30-49歳" },
  { value: "50-64", label: "50-64歳" },
  { value: "65-74", label: "65-74歳" },
  { value: "75+", label: "75歳以上" },
];

const activityOptions = [
  { value: "low", label: "低い" },
  { value: "normal", label: "ふつう" },
  { value: "high", label: "高い" },
];

const initialFoods = [
  {
    id: "rice",
    name: "雑穀ごはん",
    detail: "茶碗1杯・普通盛り想定",
    amount: 180,
    unit: "g",
    step: 25,
    baseAmount: 180,
    baseKcal: 280,
    protein: 5.0,
    fat: 1.1,
    carbs: 62,
    confidence: "中",
  },
  {
    id: "chicken",
    name: "鶏の照り焼き",
    detail: "皮つき量は写真から仮定",
    amount: 130,
    unit: "g",
    step: 20,
    baseAmount: 130,
    baseKcal: 285,
    protein: 24,
    fat: 16,
    carbs: 9,
    confidence: "中",
  },
  {
    id: "salad",
    name: "サラダ",
    detail: "ドレッシングは半分量で仮定",
    amount: 120,
    unit: "g",
    step: 20,
    baseAmount: 120,
    baseKcal: 65,
    protein: 2.5,
    fat: 3.2,
    carbs: 8,
    confidence: "高",
  },
  {
    id: "miso",
    name: "みそ汁",
    detail: "豆腐・油揚げ入り想定",
    amount: 160,
    unit: "ml",
    step: 25,
    baseAmount: 160,
    baseKcal: 60,
    protein: 4,
    fat: 2.2,
    carbs: 6,
    confidence: "中",
  },
];

const quickAddItems = [
  { name: "マヨネーズ", amount: 15, unit: "g", kcal: 100, protein: 0.2, fat: 11.3, carbs: 0.5 },
  { name: "調理油", amount: 5, unit: "g", kcal: 44, protein: 0, fat: 5, carbs: 0 },
  { name: "バター", amount: 10, unit: "g", kcal: 75, protein: 0.1, fat: 8.3, carbs: 0 },
  { name: "タレ・ソース", amount: 20, unit: "g", kcal: 24, protein: 0.4, fat: 0.1, carbs: 5.4 },
  { name: "ドレッシング", amount: 15, unit: "g", kcal: 60, protein: 0.1, fat: 6, carbs: 1.8 },
  { name: "とろけるチーズ", amount: 18, unit: "g", kcal: 61, protein: 4.1, fat: 4.7, carbs: 0.2 },
];

const formatNumber = (value) => Math.round(value).toLocaleString("ja-JP");
const historyStorageKey = "meal-calorie-photo-history-v1";

function calculateFood(food) {
  const ratio = food.amount / food.baseAmount;
  return {
    kcal: food.baseKcal * ratio,
    protein: food.protein * ratio,
    fat: food.fat * ratio,
    carbs: food.carbs * ratio,
  };
}

// 信頼度ごとの相対的な不確かさ（±割合）。写真からの推定は誤差が大きいため辛めに設定
const confidenceUncertainty = { 高: 0.12, 中: 0.22, 低: 0.38 };

// 各料理の量・信頼度を写真の特徴に応じて補正した合計カロリー範囲を、
// 一律の割合ではなく信頼度加重（二乗和平方根）で求める
function calculateRange(foods, extraUncertainty = 0) {
  let total = 0;
  let variance = 0;
  for (const food of foods) {
    const kcal = calculateFood(food).kcal;
    total += kcal;
    const u = confidenceUncertainty[food.confidence] ?? 0.25;
    variance += Math.pow(kcal * u, 2);
  }
  // 写真解析そのものの不確かさ（構図・重量が読めないほど大きい）を上乗せ
  const globalSigma = total * extraUncertainty;
  const sigma = Math.sqrt(variance + globalSigma * globalSigma);
  return {
    total,
    min: Math.max(0, total - sigma),
    max: total + sigma,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// アップロード画像をブラウザ内で解析し、色構成・明るさ・テカリ（油）・
// 食材の占有量などの特徴量を抽出する（サーバー送信なし）
function analyzeImageFeatures(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = 120;
      const h = Math.max(1, Math.round((img.height / img.width) * w));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      let data;
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch {
        resolve(null);
        return;
      }
      const n = w * h;
      let green = 0,
        warm = 0,
        pale = 0,
        red = 0,
        gloss = 0,
        food = 0,
        sumLum = 0,
        sumSat = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = max === 0 ? 0 : (max - min) / max;
        sumLum += lum;
        sumSat += sat;
        // 皿・背景・影：ほぼ無彩色で非常に明るい/暗いピクセルは食材から除外
        const isPlate = sat < 0.1 && (lum > 225 || lum < 40);
        if (isPlate) continue;
        food++;
        // 以降の分類は「食材ピクセル」に対してのみ行い、面積比は食材で正規化する
        // 野菜（緑）
        if (g > r * 1.05 && g > b * 1.05 && sat > 0.18) green++;
        // 揚げ物・肉・パンなどの茶〜金系（高カロリー傾向）
        if (r > 120 && g > 70 && b < g && r >= g && sat > 0.2 && lum > 60 && lum < 225) warm++;
        // 主食（白〜淡色：ごはん・麺・パン）。皿は上で除外済み
        if (lum > 150 && lum < 224 && sat < 0.24 && r > 140 && g > 130) pale++;
        // 赤（トマト・ソース・赤身肉）
        if (r > 140 && r > g * 1.35 && r > b * 1.35) red++;
        // 油・ソースの照り（食材上の鏡面反射：明るく彩度低め）
        if (lum > 210 && sat < 0.3) gloss++;
      }
      const foodN = Math.max(1, food);
      resolve({
        brightness: sumLum / n,
        saturation: sumSat / n,
        greenRatio: green / foodN,
        warmRatio: warm / foodN,
        paleRatio: pale / foodN,
        redRatio: red / foodN,
        glossRatio: gloss / foodN,
        fillRatio: food / n,
      });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const confidenceFromScore = (s) => (s >= 0.66 ? "高" : s >= 0.33 ? "中" : "低");

// 抽出した特徴量から、料理の量・信頼度・隠れ油分を写真ごとに導出する。
// 写真だけで重量は確定できないため、範囲・信頼度で不確かさを明示する。
function deriveFoodsFromFeatures(features) {
  if (!features) {
    return { foods: initialFoods, notes: [], extraUncertainty: 0.12 };
  }
  const { brightness, greenRatio, warmRatio, paleRatio, redRatio, glossRatio, fillRatio } = features;
  // 盛りの多さ（占有量）でポーションを全体的にスケール
  const volumeScale = clamp(0.7 + fillRatio * 0.9, 0.7, 1.45);

  const foods = [];

  // 主食（ごはん）：淡色の量に連動（食材面積比で正規化済み）
  const riceScale = clamp(0.55 + paleRatio * 1.8, 0.55, 1.6) * volumeScale;
  foods.push({
    id: "rice",
    name: "主食（ごはん・麺など）",
    detail: "白〜淡色の面積から量を推定",
    amount: Math.round(180 * riceScale),
    unit: "g",
    step: 25,
    baseAmount: 180,
    baseKcal: 280,
    protein: 5.0,
    fat: 1.1,
    carbs: 62,
    confidence: confidenceFromScore(clamp(paleRatio * 4, 0, 1)),
  });

  // 主菜（肉・揚げ物）：茶金＋赤系の量に連動
  const proteinSignal = clamp(warmRatio * 1.8 + redRatio * 1.1, 0, 1);
  const proteinScale = clamp(0.5 + proteinSignal * 1.3, 0.5, 1.6) * volumeScale;
  foods.push({
    id: "main",
    name: "主菜（肉・魚・揚げ物）",
    detail: "こんがりした色・赤身の面積から推定",
    amount: Math.round(130 * proteinScale),
    unit: "g",
    step: 20,
    baseAmount: 130,
    baseKcal: 285,
    protein: 24,
    fat: 16,
    carbs: 9,
    confidence: confidenceFromScore(proteinSignal),
  });

  // 副菜（サラダ・野菜）：緑の量に連動
  const veggieSignal = clamp(greenRatio * 2.2, 0, 1);
  const veggieScale = clamp(0.4 + veggieSignal * 1.5, 0.4, 1.7) * volumeScale;
  foods.push({
    id: "salad",
    name: "副菜（野菜・サラダ）",
    detail: "緑色の面積から量を推定",
    amount: Math.round(120 * veggieScale),
    unit: "g",
    step: 20,
    baseAmount: 120,
    baseKcal: 65,
    protein: 2.5,
    fat: 3.2,
    carbs: 8,
    confidence: confidenceFromScore(veggieSignal),
  });

  // 汁物（暗めで彩度低めの構図でより起こりうる）。基本は控えめに含める
  foods.push({
    id: "soup",
    name: "汁物・スープ",
    detail: "写真から量は仮定",
    amount: 150,
    unit: "ml",
    step: 25,
    baseAmount: 150,
    baseKcal: 55,
    protein: 3.5,
    fat: 2.0,
    carbs: 5.5,
    confidence: "低",
  });

  // 隠れ油分・ソース：照り（テカリ）と揚げ物色から推定して自動加算
  const oilSignal = clamp(glossRatio * 3.5 + warmRatio * 0.8, 0, 1.4);
  if (oilSignal > 0.18) {
    const oilGram = Math.round(clamp(oilSignal * 9, 2, 14));
    foods.push({
      id: "hidden-oil",
      name: "調理油・ソース（推定）",
      detail: "テカリ・揚げ色から自動加算",
      amount: oilGram,
      unit: "g",
      step: 2,
      baseAmount: oilGram,
      baseKcal: Math.round(oilGram * 8.5),
      protein: 0,
      fat: oilGram * 0.95,
      carbs: 0,
      confidence: "低",
    });
  }

  // 検出した特徴を利用者に見せる（透明性）
  const notes = [];
  notes.push(brightness > 150 ? "明るい写真" : brightness > 90 ? "標準的な明るさ" : "やや暗い写真");
  if (fillRatio > 0.75) notes.push("ボリューム多め");
  else if (fillRatio < 0.4) notes.push("少量");
  if (veggieSignal > 0.4) notes.push("野菜多め");
  if (proteinSignal > 0.4) notes.push("肉・揚げ物多め");
  if (paleRatio > 0.3) notes.push("主食多め");
  if (oilSignal > 0.4) notes.push("脂・ソース多め");

  // 写真が暗い/情報が乏しいほど全体の不確かさを増やす
  let extraUncertainty = 0.14;
  if (brightness < 80) extraUncertainty += 0.06;
  if (fillRatio < 0.35) extraUncertainty += 0.05;
  extraUncertainty = clamp(extraUncertainty, 0.1, 0.28);

  return { foods, notes, extraUncertainty };
}

function SegmentControl({ value, options, onChange, label }) {
  return (
    <div className="segment-group" aria-label={label}>
      {options.map((option) => (
        <button
          className={value === option.value ? "segment selected" : "segment"}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FoodRow({ food, onAmountChange, onDelete }) {
  const computed = calculateFood(food);
  const portion =
    food.amount <= food.baseAmount * 0.8
      ? "small"
      : food.amount >= food.baseAmount * 1.2
        ? "large"
        : "normal";

  const applyPortion = (value) => {
    const ratio = value === "small" ? 0.75 : value === "large" ? 1.25 : 1;
    onAmountChange(food.id, Math.round(food.baseAmount * ratio));
  };

  return (
    <article className="food-row">
      <div className="food-title-line">
        <div>
          <h3>{food.name}</h3>
          <p>{food.detail}</p>
        </div>
        <div className="row-kcal">
          <strong>{formatNumber(computed.kcal)}</strong>
          <span>kcal</span>
        </div>
        <button
          className="icon-button quiet"
          type="button"
          onClick={() => onDelete(food.id)}
          aria-label={`${food.name}を削除`}
          title="削除"
        >
          <Trash2 size={19} />
        </button>
      </div>

      <div className="food-meta">
        <span>信頼度 {food.confidence}</span>
        <span>写真からの量は仮定です</span>
      </div>

      <div className="adjust-grid">
        <span className="adjust-label">量</span>
        <SegmentControl
          label={`${food.name}の量`}
          value={portion}
          onChange={applyPortion}
          options={[
            { value: "small", label: "少なめ" },
            { value: "normal", label: "普通" },
            { value: "large", label: "多め" },
          ]}
        />
      </div>

      <div className="quantity-row">
        <button
          className="step-button"
          type="button"
          onClick={() => onAmountChange(food.id, food.amount - food.step)}
          aria-label={`${food.name}を減らす`}
          title="減らす"
        >
          <Minus size={18} />
        </button>
        <div className="quantity-value">
          <strong>{formatNumber(food.amount)}</strong>
          <span>{food.unit}</span>
        </div>
        <button
          className="step-button"
          type="button"
          onClick={() => onAmountChange(food.id, food.amount + food.step)}
          aria-label={`${food.name}を増やす`}
          title="増やす"
        >
          <Plus size={18} />
        </button>
      </div>
    </article>
  );
}

export function App() {
  const [foods, setFoods] = useState(initialFoods);
  const [sex, setSex] = useState("female");
  const [age, setAge] = useState("30-49");
  const [activity, setActivity] = useState("normal");
  const [preview, setPreview] = useState(sampleMealPath);
  const [hint, setHint] = useState("ごはん小盛り、ドレッシングは半分など");
  const [resultVisible, setResultVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("写真解析");
  const [history, setHistory] = useState([]);
  const [savedNotice, setSavedNotice] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("ソース");
  const [customKcal, setCustomKcal] = useState(40);
  const [analyzing, setAnalyzing] = useState(false);
  const [photoNotes, setPhotoNotes] = useState([]);
  const [extraUncertainty, setExtraUncertainty] = useState(0.12);
  const fileRef = useRef(null);
  const resultRef = useRef(null);

  const dailyTarget = energyTargets[sex][age][activity];
  const memoLength = hint.length;

  const totals = useMemo(() => {
    return foods.reduce(
      (sum, food) => {
        const value = calculateFood(food);
        return {
          kcal: sum.kcal + value.kcal,
          protein: sum.protein + value.protein,
          fat: sum.fat + value.fat,
          carbs: sum.carbs + value.carbs,
        };
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    );
  }, [foods]);

  const range = useMemo(() => calculateRange(foods, extraUncertainty), [foods, extraUncertainty]);
  const minKcal = range.min;
  const maxKcal = range.max;
  const dailyRatio = (totals.kcal / dailyTarget) * 100;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(historyStorageKey);
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      setHistory([]);
    }
  }, []);

  const persistHistory = (nextHistory) => {
    setHistory(nextHistory);
    window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
  };

  const updateAmount = (id, nextAmount) => {
    setFoods((current) =>
      current.map((food) =>
        food.id === id ? { ...food, amount: Math.max(food.step, nextAmount) } : food,
      ),
    );
    setLastUpdated("手動補正");
    setResultVisible(true);
  };

  const deleteFood = (id) => {
    setFoods((current) => current.filter((food) => food.id !== id));
    setLastUpdated("手動補正");
  };

  const addQuickItem = (item) => {
    setFoods((current) => [
      ...current,
      {
        id: `${item.name}-${Date.now()}`,
        name: item.name,
        detail: "見えにくい追加分",
        amount: item.amount,
        unit: item.unit,
        step: item.amount,
        baseAmount: item.amount,
        baseKcal: item.kcal,
        protein: item.protein ?? 0,
        fat: item.fat ?? item.kcal / 9,
        carbs: item.carbs ?? 0,
        confidence: "低",
      },
    ]);
    setLastUpdated("手動補正");
    setResultVisible(true);
  };

  const addCustomItem = () => {
    if (!customName.trim()) return;
    setFoods((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        name: customName.trim(),
        detail: "任意追加",
        amount: 1,
        unit: "回",
        step: 1,
        baseAmount: 1,
        baseKcal: Number(customKcal) || 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        confidence: "低",
      },
    ]);
    setCustomName("ソース");
    setCustomKcal(40);
    setCustomOpen(false);
    setLastUpdated("手動補正");
    setResultVisible(true);
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setResultVisible(false);
    setLastUpdated("写真解析");
    setSavedNotice("");
    setPhotoNotes([]);
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setSavedNotice("");
    try {
      const features = await analyzeImageFeatures(preview);
      const { foods: derived, notes, extraUncertainty: eu } = deriveFoodsFromFeatures(features);
      setFoods(derived);
      setPhotoNotes(notes);
      setExtraUncertainty(eu);
      setLastUpdated(features ? "写真解析" : "デモ推定");
    } catch {
      setFoods(initialFoods);
      setPhotoNotes([]);
      setExtraUncertainty(0.12);
      setLastUpdated("デモ推定");
    } finally {
      setAnalyzing(false);
      setResultVisible(true);
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  };

  const saveMealRecord = () => {
    const now = new Date();
    const nextRecord = {
      id: now.toISOString(),
      dateLabel: now.toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      kcal: Math.round(totals.kcal),
      minKcal: Math.round(minKcal),
      maxKcal: Math.round(maxKcal),
      ratio: Math.round(dailyRatio),
      target: dailyTarget,
      memo: hint,
      items: foods.map((food) => food.name).slice(0, 4),
    };
    persistHistory([nextRecord, ...history].slice(0, 10));
    setSavedNotice("この食事を記録しました");
  };

  const deleteRecord = (id) => {
    persistHistory(history.filter((record) => record.id !== id));
  };

  const resetDemo = () => {
    setFoods(initialFoods);
    setPreview(sampleMealPath);
    setHint("ごはん小盛り、ドレッシングは半分など");
    setResultVisible(false);
    setLastUpdated("写真解析");
    setSavedNotice("");
    setPhotoNotes([]);
    setExtraUncertainty(0.12);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <main className="app">
      <header className="topbar">
        <button className="icon-only" type="button" aria-label="メニュー" title="メニュー">
          <Menu size={28} />
        </button>
        <h1>カロリーを推定</h1>
        <button className="icon-only help" type="button" aria-label="使い方" title="使い方">
          <CircleHelp size={28} />
        </button>
      </header>

      <section className="capture-section" aria-label="食事写真の撮影">
        <div className="capture-heading">
          <h2>食事を撮影</h2>
          <span />
          <p>1〜3品が写るように、正面から明るい場所で撮影してください</p>
        </div>

        <div className="photo-frame">
          <img src={preview} alt="解析対象の食事写真" />
          <button
            className="camera-button"
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="食事写真を選ぶ"
            title="写真を選ぶ"
          >
            <Camera size={36} />
          </button>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
          />
        </div>

        <div className="capture-dots" aria-hidden="true">
          <span className="active" />
          <span />
          <span />
        </div>
      </section>

      <label className="memo-box">
        <span>
          補足メモ <small>任意</small>
        </span>
        <em>{memoLength}/60</em>
        <textarea
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          rows={2}
          maxLength={60}
          placeholder="例）ごはん小盛り、ドレッシングは半分 など"
        />
      </label>

      <section className="actions-section" aria-label="写真を分析">
        <button className="primary-button" type="button" onClick={runAnalysis} disabled={analyzing}>
          <Sparkles size={22} />
          {analyzing ? "解析中…" : "分析する"}
        </button>
        <button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}>
          <ImageIcon size={22} />
          写真を選ぶ
        </button>
      </section>

      <section className="profile-section" aria-label="成人の摂取目安">
        <div className="section-title">
          <Info size={20} />
          <div>
            <h2>成人の摂取目安</h2>
            <p>この食事が1日の目安の何％かを表示します。</p>
          </div>
        </div>
        <div className="profile-controls">
          <SegmentControl label="性別" value={sex} onChange={setSex} options={sexOptions} />
          <select value={age} onChange={(event) => setAge(event.target.value)}>
            {ageOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select value={activity} onChange={(event) => setActivity(event.target.value)}>
            {activityOptions.map((option) => (
              <option value={option.value} key={option.value}>
                活動量 {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="daily-meter">
          <div>
            <span>1日の目安</span>
            <strong>{formatNumber(dailyTarget)} kcal</strong>
          </div>
          <div>
            <span>この食事</span>
            <strong>{Math.round(dailyRatio)}%</strong>
          </div>
        </div>
        <div className="meter-track" aria-hidden="true">
          <div style={{ width: `${Math.min(dailyRatio, 100)}%` }} />
        </div>
      </section>

      <section className="disclaimer compact" aria-label="注意事項">
        <Info size={17} />
        <p>本アプリの結果はAIによる概算です。医療行為の代替ではなく、健康管理の目安としてご利用ください。</p>
      </section>

      {resultVisible && (
        <section className="result-section" aria-label="推定結果" ref={resultRef}>
          <div className="result-card">
            <div className="status-pill">{lastUpdated}</div>
            <span className="result-label">推定カロリー</span>
            <div className="kcal-range">
              {formatNumber(minKcal)}〜{formatNumber(maxKcal)}
              <span>kcal</span>
            </div>
            <div className="macro-line">
              <span>たんぱく質 {totals.protein.toFixed(1)}g</span>
              <span>脂質 {totals.fat.toFixed(1)}g</span>
              <span>炭水化物 {totals.carbs.toFixed(1)}g</span>
            </div>
            {photoNotes.length > 0 && (
              <div className="feature-chips" aria-label="写真から検出した特徴">
                <span className="feature-chips-label">写真から検出</span>
                {photoNotes.map((note) => (
                  <span className="feature-chip" key={note}>
                    {note}
                  </span>
                ))}
              </div>
            )}
            <p>
              {sex === "male" ? "成人男性" : "成人女性"}・{ageOptions.find((item) => item.value === age)?.label}
              ・活動量{activityOptions.find((item) => item.value === activity)?.label}の1日目安
              {formatNumber(dailyTarget)} kcalに対して約{Math.round(dailyRatio)}%です。
            </p>
            <p className="demo-note">
              写真の色・明るさ・テカリ・占有量をブラウザ内で解析し、料理の量と信頼度を推定しています。写真だけでは重量を確定できないため、幅（範囲）と信頼度で不確かさを示しています。
            </p>
          </div>

          <div className="food-header">
            <div className="section-title">
              <SlidersHorizontal size={22} />
              <div>
                <h2>料理・食品を調整</h2>
                <p>量や見えない食材を直すと、合計も更新されます。</p>
              </div>
            </div>
            <span className="unit-note">g / ml</span>
          </div>

          <div className="food-list">
            {foods.map((food) => (
              <FoodRow
                key={food.id}
                food={food}
                onAmountChange={updateAmount}
                onDelete={deleteFood}
              />
            ))}
          </div>

          <div className="add-section">
            <button className="add-food-button" type="button" onClick={() => setCustomOpen(true)}>
              <Plus size={22} />
              料理・食品を追加
            </button>
            <p>よくある「見えない食材」を追加</p>
            <div className="quick-add-grid">
              {quickAddItems.map((item) => (
                <button type="button" key={item.name} onClick={() => addQuickItem(item)}>
                  <span>
                    {item.name} {item.amount}
                    {item.unit}
                  </span>
                  <strong>+{item.kcal} kcal</strong>
                </button>
              ))}
            </div>
            {customOpen && (
              <div className="custom-add">
                <input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="食品名"
                />
                <input
                  value={customKcal}
                  onChange={(event) => setCustomKcal(event.target.value)}
                  inputMode="numeric"
                  type="number"
                  min="0"
                  placeholder="kcal"
                />
                <button type="button" onClick={addCustomItem}>
                  追加
                </button>
              </div>
            )}
          </div>

          <div className="recalc-section">
            <div>
              <span>再計算後の合計（目安）</span>
              <strong>
                {formatNumber(minKcal)}〜{formatNumber(maxKcal)}
                <small> kcal</small>
              </strong>
              {savedNotice && <p className="saved-notice">{savedNotice}</p>}
            </div>
            <div className="result-actions">
              <button className="save-button" type="button" onClick={saveMealRecord}>
                記録する
              </button>
              <button className="recalc-button" type="button" onClick={() => setLastUpdated("再計算済み")}>
                <RotateCcw size={20} />
                再計算
              </button>
            </div>
          </div>

          <section className="history-section" aria-label="今日の記録">
            <div className="section-title">
              <History size={21} />
              <div>
                <h2>最近の記録</h2>
                <p>このスマホ内に保存されます。</p>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="empty-history">まだ記録はありません。</p>
            ) : (
              <div className="history-list">
                {history.map((record) => (
                  <article className="history-item" key={record.id}>
                    <div>
                      <span>{record.dateLabel}</span>
                      <strong>
                        {formatNumber(record.minKcal)}〜{formatNumber(record.maxKcal)} kcal
                      </strong>
                      <p>{record.items.join("、")}</p>
                    </div>
                    <button type="button" onClick={() => deleteRecord(record.id)}>
                      削除
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      <section className="source-note">
        <p>
          成人の基準: 厚生労働省「日本人の食事摂取基準（2025年版）」推定エネルギー必要量。
          写真だけでは油、ソース、隠れた具材を正確に判定できません。
        </p>
        <button type="button" onClick={resetDemo}>
          デモ状態に戻す
        </button>
      </section>
    </main>
  );
}
