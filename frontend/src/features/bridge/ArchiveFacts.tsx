import { useState } from "react";
import type { Bridge } from "../../api/types";
import { num, time } from "../../api/types";

export function ArchiveFacts({ bridge: b }: { bridge: Bridge }) {
  const [tab, setTab] = useState<"structure" | "management" | "attachments">(
    "structure",
  );
  const a = b.archive;
  if (!a) return <p className="muted-caption">扩展档案未提供。</p>;
  const groups = {
    structure: [
      ["跨径分类", b.spanTypeName],
      ["桥跨数", num(a.spanCount)],
      ["跨径组合 m", a.spanArrangement],
      ["最大跨径 m", num(a.maxSpan)],
      ["桥面面积 m²", num(a.deckArea)],
      ["材料", a.materialName],
      ["主梁形式", a.mainGirderName],
      ["荷载等级", a.loadGradeName],
      ["限载标准", a.loadLimitName],
      ["设计荷载（来源文本）", a.designLoad],
      ["实际荷载（来源文本）", a.actualLoad],
      [
        "三特标志",
        b.specialBridge == null
          ? "未提供"
          : b.specialBridge === 1
            ? "是"
            : b.specialBridge === 0
              ? "否"
              : `来源编码 ${b.specialBridge}`,
      ],
      ["已登记三特类型", b.specialTypeNames.join("、") || "未登记"],
      [
        "是否独柱墩",
        a.singleColumnPier == null
          ? "未提供"
          : a.singleColumnPier
            ? "是"
            : "否",
      ],
      ["独柱墩数量（来源）", a.singleColumnPierCount],
    ],
    management: [
      ["行政区划", a.districtCode],
      ["桥梁分类", a.bridgeClassName],
      ["用途分类", a.useClassName],
      ["道路等级", a.roadGradeName],
      ["养护等级", a.maintenanceLevelName],
      ["建设单位", a.constructionUnit],
      ["设计单位", a.designUnit],
      ["监理单位", a.supervisionUnit],
      ["施工单位", a.contractor],
      ["改扩建 / 大中修日期", a.reconstructionDate],
      ["总造价 万元", num(a.costTenThousand)],
      ["桥梁概况", a.overview],
    ],
    attachments: [
      ["档案编号", a.archiveCode],
      ["图纸情况（来源）", a.drawingStatus],
      ["电子档案（来源）", a.electronicArchive],
      ["档案同步时间", time(a.sourceUpdatedAt)],
    ],
  };
  return (
    <div className="archive-extension">
      <div className="tabs">
        {(
          [
            ["structure", "结构与荷载"],
            ["management", "建设与管养"],
            ["attachments", "档案与附件"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <dl className="bridge-facts archive-facts">
        {groups[tab].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value == null || value === "" ? "未提供" : value}</dd>
          </div>
        ))}
      </dl>
      {tab === "attachments" && (
        <p className="muted-caption">
          桥梁图片和其他附件在页面右下方“桥梁报告档案”按来源展示，文件访问状态单独标明。
        </p>
      )}
    </div>
  );
}
