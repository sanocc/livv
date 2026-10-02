import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowDown,
  DownloadSimple,
  List,
  X,
  CheckCircle,
  CaretDown,
  MapPin,
  CalendarBlank,
  CloudCheck,
  Play,
  Pause,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ComposedChart,
  Bar,
} from "recharts";
const chapters = [
  ["home", "POAI", "品牌介绍"],
  ["ai", "AI", "智能引擎"],
  ["ota", "OTA", "价格监控"],
  ["ops", "OPS", "经营分析"],
  ["data", "DATA", "数据中枢"],
  ["agent", "AGENT", "酒店助手"],
];
const prices = [428, 468, 498, 438, 398, 408, 388].map((p, i) => ({
  date: `10/0${i + 2}`,
  own: p,
  a: p - 60,
  b: p - 110,
  occupancy: [72, 81, 88, 78, 74, 79, 82][i],
  revpar: [308, 379, 438, 342, 295, 322, 318][i],
}));
function Tip({ active, payload, label }) {
  return active && payload?.length ? (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((p) => (
        <div key={p.dataKey}>
          <span style={{ color: p.color }}>{p.name}</span>
          <b>{p.dataKey === "occupancy" ? `${p.value}%` : `¥${p.value}`}</b>
        </div>
      ))}
    </div>
  ) : null;
}
function Chart({ ops = false }) {
  const [hotel, setHotel] = useState("all");
  const common = (
    <>
      <CartesianGrid stroke="#172638" vertical={false} />
      <XAxis
        dataKey="date"
        tick={{ fill: "#8195ac", fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        dy={10}
      />
      <Tooltip content={<Tip />} />
    </>
  );
  return (
    <div className="product-preview">
      <div className="preview-bar">
        <span>
          POAI <small>/ {ops ? "OPS" : "OTA"}</small>
        </span>
        <span className="sample">示例数据</span>
      </div>
      {!ops && (
        <div className="preview-controls">
          <span>
            <MapPin size={14} />
            上海
          </span>
          <span>
            <CalendarBlank size={14} />
            10.02 — 10.08
          </span>
          <label>
            <select
              value={hotel}
              onChange={(e) => setHotel(e.target.value)}
              aria-label="展示酒店"
            >
              <option value="all">全部竞品</option>
              <option value="own">本酒店</option>
              <option value="a">竞品酒店 A</option>
              <option value="b">竞品酒店 B</option>
            </select>
            <CaretDown size={12} />
          </label>
        </div>
      )}
      <h3>{ops ? "经营表现趋势" : "市场价格趋势"}</h3>
      <p>{ops ? "让每一次变化，都有迹可循" : "同区域酒店 · 标准间价格对比"}</p>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          {ops ? (
            <ComposedChart
              data={prices}
              margin={{ top: 20, right: 0, bottom: 12, left: 0 }}
            >
              {common}
              <YAxis
                yAxisId="l"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "#8195ac", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <YAxis
                yAxisId="r"
                orientation="right"
                domain={[0, 500]}
                tick={{ fill: "#8195ac", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Bar
                yAxisId="r"
                dataKey="revpar"
                name="RevPAR"
                fill="#254b73"
                barSize={26}
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="l"
                type="monotone"
                dataKey="occupancy"
                name="入住率"
                stroke="#38bce9"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          ) : (
            <LineChart
              data={prices}
              margin={{ top: 20, right: 15, bottom: 12, left: 0 }}
            >
              {common}
              <YAxis
                domain={[200, 550]}
                tick={{ fill: "#8195ac", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              {[
                ["own", "本酒店", "#2787ff"],
                ["a", "竞品酒店 A", "#36bfc8"],
                ["b", "竞品酒店 B", "#75839a"],
              ]
                .filter(([key]) => hotel === "all" || hotel === key)
                .map(([key, name, color]) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={name}
                    stroke={color}
                    strokeWidth={2.3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="legend">
        {ops ? (
          <>
            <span className="cyan">入住率</span>
            <span className="blue">每间可售房收入 RevPAR</span>
          </>
        ) : (
          <>
            <span className="blue">本酒店</span>
            <span className="cyan">竞品酒店 A</span>
            <span className="gray">竞品酒店 B</span>
          </>
        )}
      </div>
    </div>
  );
}
function Assistant() {
  const [tab, setTab] = useState("采集结果");
  const [auto, setAuto] = useState(true);
  return (
    <div className="agent-window">
      <div className="agent-title">
        <img src="/assets/poai-logo.png" alt="POAI" />
        <strong>酒店助手</strong>
        <span className="sample">示例界面</span>
      </div>
      <div className="agent-tabs">
        {["采集结果", "任务状态", "设备状态"].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="agent-body">
        <div className="agent-success">
          <CheckCircle weight="fill" size={25} />
          <div>
            <strong>
              {tab === "采集结果"
                ? "采集完成"
                : tab === "任务状态"
                  ? auto
                    ? "自动接单已开启"
                    : "自动接单已暂停"
                  : "设备已授权"}
            </strong>
            <span>
              {tab === "采集结果" ? "上海 · 携程酒店市场" : "办公室设备 · 在线"}
            </span>
          </div>
        </div>
        {tab === "采集结果" ? (
          <>
            <div className="agent-metric">
              <span>已采集酒店</span>
              <strong>
                30 <small>家</small>
              </strong>
            </div>
            <div className="agent-row">
              <span>采集时间</span>
              <b>2026-10-02 14:28</b>
            </div>
            <div className="agent-row">
              <span>数据同步</span>
              <b className="green">
                <CloudCheck size={16} />
                已同步至云端
              </b>
            </div>
            <p>打开 OTA，查看最新市场变化。</p>
          </>
        ) : tab === "任务状态" ? (
          <>
            <div className="agent-row">
              <span>最近任务</span>
              <b>市场列表采集</b>
            </div>
            <div className="agent-row">
              <span>执行结果</span>
              <b className="green">已完成</b>
            </div>
            <button className="auto-toggle" onClick={() => setAuto(!auto)}>
              {auto ? <Pause size={16} /> : <Play size={16} />}{" "}
              {auto ? "暂停自动接单" : "开启自动接单"}
            </button>
          </>
        ) : (
          <>
            <div className="agent-row">
              <span>浏览器</span>
              <b>Chrome</b>
            </div>
            <div className="agent-row">
              <span>设备状态</span>
              <b className="green">在线 · 空闲</b>
            </div>
            <div className="agent-row">
              <span>上传权限</span>
              <b>已开启</b>
            </div>
          </>
        )}
      </div>
      <div className="agent-footer">已连接 POAI 云端</div>
    </div>
  );
}
export function App() {
  const [active, setActive] = useState("home");
  const [menu, setMenu] = useState(false);
  const scroller = useRef(null);
  const go = (id) => {
    setMenu(false);
    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  useEffect(() => {
    const observer = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            setActive(e.target.id);
            e.target.classList.add("is-visible");
          }
        }),
      { root: scroller.current, threshold: 0.4 },
    );
    chapters.forEach(([id]) => observer.observe(document.getElementById(id)));
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <a href="#home" className="skip-link">
        跳转到主要内容
      </a>
      <header
        className={active === "home" ? "site-header" : "site-header scrolled"}
      >
        <button
          className="brand"
          aria-label="POAI 首页"
          onClick={() => go("home")}
        >
          <img src="/assets/poai-logo.png" alt="POAI" />
        </button>
        <nav className={menu ? "open" : ""} aria-label="板块导航">
          {chapters.slice(1).map(([id, label]) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={active === id ? "active" : ""}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className="menu-toggle"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label={menu ? "关闭导航" : "打开导航"}
        >
          {menu ? <X size={24} /> : <List size={24} />}
        </button>
      </header>
      <aside className="page-dots" aria-label="页面位置">
        {chapters.map(([id, label, name]) => (
          <button
            key={id}
            aria-label={`${label} ${name}`}
            aria-current={active === id ? "step" : undefined}
            className={active === id ? "active" : ""}
            onClick={() => go(id)}
          >
            <span className="dot-label">{label}</span>
            <span className="dot" />
          </button>
        ))}
      </aside>
      <main ref={scroller} className="page-scroller">
        <section
          id="home"
          className="scene hero is-visible"
          aria-labelledby="hero-heading"
        >
          <div className="hero-art" />
          <div className="scene-inner hero-inner">
            <div className="hero-copy">
              <h1 id="hero-heading">
                看清变化，
                <br />
                从容经营。
              </h1>
              <p>
                <span>连接市场、经营与智能的</span>
                <span>酒店数据平台。</span>
              </p>
              <button className="action" onClick={() => go("ai")}>
                探索 POAI
                <ArrowRight size={23} />
              </button>
            </div>
            <div className="brand-note" aria-hidden="true">
              DATA
              <br />
              FOR A<br />
              BETTER
              <br />
              TOMORROW
              <span />
            </div>
          </div>
          <button className="scroll-hint" onClick={() => go("ai")}>
            向下滚动
            <ArrowDown size={24} />
          </button>
        </section>
        {chapters.slice(1).map(([id, label, name], i) => (
          <section
            key={id}
            id={id}
            className={`scene ${id === "agent" ? "agent-scene" : ""}`}
            aria-labelledby={`${id}-heading`}
          >
            <div className={`scene-inner ${id === "ops" ? "reverse" : ""}`}>
              <div className="chapter-copy">
                <span className="eyebrow">
                  0{i + 1} /{" "}
                  {
                    [
                      "INTELLIGENCE",
                      "MARKET",
                      "OPERATIONS",
                      "CONNECTION",
                      "ASSISTANT",
                    ][i]
                  }
                </span>
                <h2 id={`${id}-heading`}>{label}</h2>
                <h3>{name}</h3>
                <p className="chapter-tagline">
                  {
                    [
                      "让数据，成为洞察。",
                      "市场变化，一眼看清。",
                      "经营表现，心中有数。",
                      "连接数据，贯通价值。",
                      "轻松采集，持续连接。",
                    ][i]
                  }
                </p>
                {(id === "ai" || id === "ops") && (
                  <span className="coming-soon">建设中</span>
                )}
                {id === "ota" && (
                  <a
                    href="https://ota.poai.cc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="action"
                  >
                    进入 OTA
                    <ArrowRight size={20} />
                  </a>
                )}
                {id === "agent" && (
                  <a
                    href="https://poai.cc/downloads/poai-agent-1.3.5.zip"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="action"
                  >
                    下载酒店助手
                    <DownloadSimple size={20} />
                  </a>
                )}
                <p className="chapter-description">
                  {
                    [
                      "从市场与经营数据中发现变化，\n为下一次决策提供新的视角。",
                      "关注酒店市场价格，\n掌握竞品动态与价格趋势。",
                      "从营收、入住率到经营趋势，\n让每一次变化都更清晰。",
                      "连接采集与分析，\n让数据在各项能力之间流动。",
                      "本地 Chrome 扩展，\n连接酒店价格采集与云端平台。",
                    ][i]
                  }
                </p>
              </div>
              <div
                className={`visual ${id === "ai" || id === "data" ? "art-visual" : ""} ${id === "agent" ? "agent-visual" : ""}`}
              >
                {id === "ai" ? (
                  <>
                    <img
                      src="/assets/ai-engine.webp"
                      alt="蓝色数据流汇聚形成智能引擎的视觉示意"
                    />
                    <span className="visual-caption">FROM DATA TO INSIGHT</span>
                  </>
                ) : id === "ota" ? (
                  <Chart />
                ) : id === "ops" ? (
                  <Chart ops />
                ) : id === "data" ? (
                  <>
                    <img
                      src="/assets/data-hub.webp"
                      alt="市场与经营数据连接至统一中枢的视觉示意"
                    />
                    <span className="visual-caption">
                      ONE CONNECTION. MORE POSSIBILITIES.
                    </span>
                  </>
                ) : (
                  <Assistant />
                )}
              </div>
            </div>
            {id === "agent" && (
              <footer>
                <img src="/assets/poai-logo.png" alt="POAI" />
                <span>DATA FOR A BETTER TOMORROW</span>
                <button onClick={() => go("home")}>
                  回到首页
                  <ArrowRight size={16} />
                </button>
              </footer>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
