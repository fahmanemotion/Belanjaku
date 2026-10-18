"use client";

/**
 * Grafik Target vs Realisasi
 * - jenis "batang": dua batang per periode (Target | Realisasi) + label deviasi di atasnya
 * - jenis "garis" + kumulatif: Kurva S (persen kumulatif terhadap pagu) dengan area deviasi diarsir
 * - jenis "garis" tanpa kumulatif: tren nilai per periode (dipakai untuk tampilan tahunan)
 * Lebar gambar mengikuti wadahnya, jadi teks tetap terbaca di HP maupun monitor besar.
 */
import { useEffect, useRef, useState } from "react";
import { desimal, rupiah, rupiahSingkat } from "@/lib/format";

export type JenisGrafik = "batang" | "garis";

interface Props {
  labels: string[];
  /** label panjang untuk tooltip (mis. "Oktober 2026") */
  labelPanjang?: string[];
  target: number[];
  realisasi: (number | null)[];
  jenis: JenisGrafik;
  kumulatif: boolean;
  pagu: number;
  /** indeks periode berjalan (belum tutup buku) */
  sorot?: number;
  ariaLabel: string;
}

/** Batas deviasi yang dianggap wajar (persen) */
const BATAS_DEVIASI = 5;

/** Ukuran wadah (lebar & tinggi) yang selalu mengikuti layar */
function useUkuran(awal: { w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ukuran, setUkuran] = useState(awal);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setUkuran({ w: Math.max(260, Math.round(e.contentRect.width)), h: Math.round(e.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ukuran] as const;
}

/** Skala sumbu-Y dengan angka bulat, maksimal ±4 garis bantu */
function skala(maks: number) {
  const langkah = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((s) => maks / s <= 4) ?? 200;
  const puncak = Math.max(langkah, Math.ceil(maks / langkah) * langkah);
  const ticks = Array.from({ length: Math.round(puncak / langkah) + 1 }, (_, i) => i * langkah);
  return { puncak, ticks };
}

/** Path batang dengan sudut atas membulat */
function batang(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0.5) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const tanda = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

export default function GrafikTargetRealisasi({ labels, labelPanjang, target, realisasi, jenis, kumulatif, pagu, sorot, ariaLabel }: Props) {
  const [ref, ukuran] = useUkuran({ w: 760, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  const n = labels.length;
  const W = ukuran.w;
  const kecil = W < 520;
  // Tinggi minimum dibuat ringkas; bila panel di sebelahnya lebih tinggi, grafik ikut mengisi agar sejajar
  const tinggiMin = kecil ? 230 : 270;
  const H = Math.max(tinggiMin, ukuran.h);
  const L = 50, R = 14, T = 26, B = 30;
  const ih = H - T - B;
  const gw = (W - L - R) / n;
  const cx = (i: number) => L + gw * (i + 0.5);

  // ---------- nilai yang digambar ----------
  const nReal = realisasi.findIndex((r) => r === null) === -1 ? n : realisasi.findIndex((r) => r === null);
  const kumul = (arr: number[]) => arr.reduce<number[]>((acc, v, i) => [...acc, (acc[i - 1] ?? 0) + v], []);
  const tgtKum = kumul(target);
  const realKum = kumul(realisasi.slice(0, nReal).map((r) => r ?? 0));

  const modeKurvaS = jenis === "garis" && kumulatif;
  const tV = modeKurvaS ? tgtKum.map((v) => (v / pagu) * 100) : target.map((v) => v / 1e9);
  const rV = modeKurvaS ? realKum.map((v) => (v / pagu) * 100) : realisasi.slice(0, nReal).map((v) => (v ?? 0) / 1e9);

  const { puncak, ticks } = modeKurvaS
    ? { puncak: 100, ticks: [0, 25, 50, 75, 100] }
    : skala(Math.max(...tV, ...rV, 0.01));
  const y = (v: number) => T + ih - (Math.min(v, puncak) / puncak) * ih;
  const fmtTick = (v: number) => (modeKurvaS ? `${v}%` : v ? `${desimal(v, v < 1 ? 2 : 1)} M` : "0");

  // ---------- tooltip ----------
  const tip = hover === null ? null : (() => {
    const i = hover;
    const t = modeKurvaS ? tgtKum[i] : target[i];
    const r = i < nReal ? (modeKurvaS ? realKum[i] : (realisasi[i] ?? 0)) : null;
    const dev = r === null ? null : modeKurvaS ? ((r - t) / pagu) * 100 : t ? ((r - t) / t) * 100 : 0;
    return { i, t, r, dev };
  })();

  const lebarTip = 190;
  const posTip = tip ? Math.min(Math.max(cx(tip.i) - lebarTip / 2, 0), W - lebarTip) : 0;

  return (
    <div ref={ref} className="gtr" style={{ minHeight: tinggiMin }} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={ariaLabel}>
        {/* garis bantu & sumbu */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} strokeDasharray={v ? "3 4" : undefined} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} style={{ fill: "var(--muted)" }}>
              {fmtTick(v)}
            </text>
          </g>
        ))}

        {/* sorot periode berjalan */}
        {sorot !== undefined && sorot < n && (
          <rect x={L + gw * sorot} y={T - 18} width={gw} height={ih + 18} rx={8} style={{ fill: "var(--sub)" }} />
        )}

        {/* garis bantu hover */}
        {hover !== null && (
          <line x1={cx(hover)} x2={cx(hover)} y1={T - 6} y2={T + ih} style={{ stroke: "var(--muted)" }} strokeDasharray="2 3" opacity={0.6} />
        )}

        {jenis === "batang" ? (
          /* ================= BATANG GANDA ================= */
          labels.map((lb, i) => {
            const inner = gw * (kecil ? 0.8 : 0.66);
            const gap = Math.max(2, gw * 0.05);
            const bw = (inner - gap) / 2;
            const xT = cx(i) - inner / 2;
            const xR = xT + bw + gap;
            const yT = y(tV[i]);
            const ada = i < nReal;
            const yR = ada ? y(rV[i]) : T + ih;
            // periode berjalan belum tutup buku → deviasinya tidak ditampilkan
            const dev = ada && i !== sorot && target[i] ? (((realisasi[i] ?? 0) - target[i]) / target[i]) * 100 : null;
            const redup = hover !== null && hover !== i;
            return (
              <g key={lb} opacity={redup ? 0.45 : 1}>
                <path d={batang(xT, yT, bw, T + ih - yT, 6)} style={{ fill: "var(--accent)" }} />
                {ada && <path d={batang(xR, yR, bw, T + ih - yR, 6)} style={{ fill: "var(--ink)" }} />}
                {dev !== null && gw >= 34 && (
                  <text
                    x={cx(i)}
                    y={Math.min(yT, yR) - 7}
                    textAnchor="middle"
                    fontSize={kecil ? 9.5 : 10.5}
                    fontWeight={700}
                    style={{ fill: Math.abs(dev) <= BATAS_DEVIASI ? "var(--good)" : "var(--bad)" }}
                  >
                    {tanda(dev)}
                    {desimal(Math.abs(dev), 0)}%
                  </text>
                )}
              </g>
            );
          })
        ) : (
          /* ================= GARIS / KURVA S ================= */
          <>
            {nReal > 0 && (
              <polygon
                points={[
                  ...tV.slice(0, nReal).map((v, i) => `${cx(i)},${y(v)}`),
                  ...rV.map((v, i) => `${cx(i)},${y(v)}`).reverse(),
                ].join(" ")}
                style={{ fill: "var(--accent)" }}
                opacity={0.13}
              />
            )}
            <polyline
              points={tV.map((v, i) => `${cx(i)},${y(v)}`).join(" ")}
              fill="none"
              style={{ stroke: "var(--accent)" }}
              strokeWidth={2.5}
              strokeDasharray="7 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={rV.map((v, i) => `${cx(i)},${y(v)}`).join(" ")}
              fill="none"
              style={{ stroke: "var(--ink)" }}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {tV.map((v, i) => (
              <circle key={`t${i}`} cx={cx(i)} cy={y(v)} r={hover === i ? 5 : 3.5} style={{ fill: "var(--panel)", stroke: "var(--accent)" }} strokeWidth={2} />
            ))}
            {rV.map((v, i) => (
              <circle
                key={`r${i}`}
                cx={cx(i)}
                cy={y(v)}
                r={hover === i || i === nReal - 1 ? 5.5 : 3.5}
                style={{ fill: i === nReal - 1 ? "var(--ink)" : "var(--panel)", stroke: "var(--ink)" }}
                strokeWidth={2}
              />
            ))}

            {/* penanda deviasi pada titik realisasi terakhir */}
            {nReal > 0 && (() => {
              const k = nReal - 1;
              const yr = y(rV[k]);
              const yt = y(tV[k]);
              const selisih = modeKurvaS ? rV[k] - tV[k] : target[k] ? ((rV[k] - tV[k]) / tV[k]) * 100 : 0;
              const kanan = cx(k) < W - 150;
              const teks = modeKurvaS ? `Deviasi ${tanda(selisih)}${desimal(Math.abs(selisih))} poin` : `${tanda(selisih)}${desimal(Math.abs(selisih))}%`;
              return (
                <g>
                  <line x1={cx(k)} x2={cx(k)} y1={yr} y2={yt} style={{ stroke: "var(--bad)" }} strokeWidth={1.5} strokeDasharray="3 3" />
                  <text
                    x={cx(k) + (kanan ? 10 : -10)}
                    y={(yr + yt) / 2 + 4}
                    textAnchor={kanan ? "start" : "end"}
                    fontSize={11.5}
                    fontWeight={700}
                    paintOrder="stroke"
                    strokeWidth={4}
                    style={{ fill: Math.abs(selisih) <= BATAS_DEVIASI ? "var(--good)" : "var(--bad)", stroke: "var(--panel)" }}
                  >
                    {teks}
                  </text>
                </g>
              );
            })()}
          </>
        )}

        {/* label sumbu-X */}
        {labels.map((lb, i) => (
          <text
            key={lb}
            x={cx(i)}
            y={H - 9}
            textAnchor="middle"
            fontSize={kecil ? 10 : 11.5}
            fontWeight={i === sorot || i === hover ? 700 : 500}
            style={{ fill: i === sorot || i === hover ? "var(--ink)" : "var(--muted)" }}
          >
            {lb}
          </text>
        ))}

        {/* area sentuh / hover per periode */}
        {labels.map((lb, i) => (
          <rect
            key={`h${lb}`}
            x={L + gw * i}
            y={T - 18}
            width={gw}
            height={ih + B + 18}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onClick={() => setHover(i)}
          />
        ))}
      </svg>

      {tip && (
        <div className="tip" style={{ left: posTip, width: lebarTip }} role="status">
          <b>
            {labelPanjang?.[tip.i] ?? labels[tip.i]}
            {tip.i === sorot ? " · berjalan" : ""}
          </b>
          <div>
            <i style={{ background: "var(--accent)" }} />
            {modeKurvaS ? "Target kumulatif" : "Target"}
            <span>{rupiahSingkat(tip.t)}</span>
          </div>
          <div>
            <i style={{ background: "var(--ink)" }} />
            {modeKurvaS ? "Realisasi kumulatif" : "Realisasi"}
            <span>{tip.r === null ? "belum ada" : rupiahSingkat(tip.r)}</span>
          </div>
          {modeKurvaS && tip.r !== null && (
            <div className="muted">
              Progres<span>{desimal((tip.r / pagu) * 100)}% / {desimal((tip.t / pagu) * 100)}%</span>
            </div>
          )}
          {tip.dev !== null && (
            <div className={Math.abs(tip.dev) <= BATAS_DEVIASI ? "ok" : "bad"}>
              Deviasi
              <span>
                {tanda(tip.dev)}
                {desimal(Math.abs(tip.dev))}
                {modeKurvaS ? " poin" : "%"}
              </span>
            </div>
          )}
          {tip.r !== null && <div className="muted mono" style={{ fontSize: 10.5 }}>{rupiah(tip.r)}</div>}
        </div>
      )}
    </div>
  );
}
