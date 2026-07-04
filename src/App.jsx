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
  { name: "マヨネーズ", amount: 15, unit: "g", kcal: 94 },
  { name: "油", amount: 5, unit: "g", kcal: 37 },
  { name: "バター", amount: 10, unit: "g", kcal: 75 },
  { name: "タレ・ソース", amount: 20, unit: "g", kcal: 42 },
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
  const [lastUpdated, setLastUpdated] = useState("デモ推定");
  const [history, setHistory] = useState([]);
  const [savedNotice, setSavedNotice] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("ソース");
  const [customKcal, setCustomKcal] = useState(40);
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

  const minKcal = totals.kcal * 0.88;
  const maxKcal = totals.kcal * 1.12;
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
        protein: 0,
        fat: item.kcal / 9,
        carbs: 0,
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
    setLastUpdated("デモ推定");
    setSavedNotice("");
  };

  const runAnalysis = () => {
    setResultVisible(true);
    setLastUpdated("デモ推定");
    setSavedNotice("");
    window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
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
    setLastUpdated("デモ推定");
    setSavedNotice("");
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
        <button className="primary-button" type="button" onClick={runAnalysis}>
          <Sparkles size={22} />
          分析する
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
            <p>
              {sex === "male" ? "成人男性" : "成人女性"}・{ageOptions.find((item) => item.value === age)?.label}
              ・活動量{activityOptions.find((item) => item.value === activity)?.label}の1日目安
              {formatNumber(dailyTarget)} kcalに対して約{Math.round(dailyRatio)}%です。
            </p>
            <p className="demo-note">APIキー未設定のため、現在はスマホで試せるデモ推定です。</p>
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
