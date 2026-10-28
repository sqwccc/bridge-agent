import { useState } from "react";
import type { Bridge } from "../../api/types";
import { Panel } from "../shared/ui";
import { StructureEditor } from "./StructureEditor";
import { bindingKey } from "../../api/structure";
import photo from "../../assets/wanfu-photo.png";
import { WanfuStructure } from "./WanfuStructure";
import {
  ZONES,
  useStructure,
  isSelected,
  isWanfu,
  shapeOf,
  SHAPE_NAMES,
  Schematic,
  type Shape,
} from "./BridgeStructure";

export function BridgeVisual({ bridge }: { bridge: Bridge }) {
  const [view, setView] = useState<"structure" | "photo">("structure");
  const { selection, select, parts, selectedPart, config, points } =
    useStructure();
  const wanfu = isWanfu(bridge);
  const showPhoto = wanfu && view === "photo" && selection === null;
  const label =
    selection === "all"
      ? "全部部位"
      : selection
        ? `${selection.zone}${selection.part ? " · " + (selectedPart?.name || "") : ""}`
        : "未选择部位";
  return (
    <Panel
      title="桥梁结构示意"
      note={
        wanfu
          ? "万福大桥 · 原型立面底图"
          : `${SHAPE_NAMES[(config.data?.shape as Shape) || shapeOf(bridge)]} · 示意立面`
      }
      className="bridge-visual-panel interactive-structure"
    >
      <div className="structure-toolbar">
        <StructureEditor />
        {wanfu && (
          <div className="structure-view-tabs">
            <button
              aria-pressed={!showPhoto}
              onClick={() => setView("structure")}
            >
              结构图
            </button>
            <button
              aria-pressed={showPhoto}
              onClick={() => {
                select(null);
                setView("photo");
              }}
            >
              实拍图
            </button>
          </div>
        )}
        <button
          aria-pressed={selection === "all"}
          onClick={() => {
            setView("structure");
            select("all");
          }}
        >
          全部部位
        </button>
        <button onClick={() => select(null)}>清除选择</button>
      </div>
      <div className="structure-stage">
        {showPhoto ? (
          <img
            className="structure-photo"
            src={photo}
            alt="万福大桥历史实拍资料"
          />
        ) : wanfu ? (
          <WanfuStructure />
        ) : (
          <Schematic bridge={bridge} />
        )}
      </div>
      {!showPhoto && (
        <div className="structure-part-controls" aria-label="图示部件选择">
          {ZONES.map((zone) => (
            <div key={zone}>
              <button
                aria-pressed={isSelected(selection, zone)}
                onClick={() => select({ zone })}
              >
                {zone}
              </button>
              <div>
                {parts
                  .filter((p) => p.zone === zone)
                  .map((part) => (
                    <button
                      key={part.id}
                      aria-pressed={isSelected(selection, zone, part.id)}
                      onClick={() => select({ zone, part: part.id })}
                    >
                      {part.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {config.isPending && <p role="status">正在读取部件配置…</p>}
      {config.error && (
        <p role="alert">
          部件配置加载失败{" "}
          <button onClick={() => void config.refetch()}>重试配置</button>
        </p>
      )}
      {selectedPart && (
        <div className="selected-part-info">
          <strong>{selectedPart.name}</strong> ·{" "}
          {selectedPart.anchor ? "图示部件" : "自定义部件 · 部位范围示意"}
          {selectedPart.description && <p>{selectedPart.description}</p>}
          <p>
            {!selectedPart.bindings.length
              ? "待绑定测点"
              : points.error
                ? "绑定状态暂不可核验"
                : points.isPending
                  ? "正在核验测点…"
                  : `${selectedPart.bindings.length} 个绑定，${selectedPart.bindings.filter((b) => !points.data?.some((p) => bindingKey(p) === bindingKey(b))).length} 个已失效`}
          </p>
        </div>
      )}
      <p className="structure-selection" role="status">
        {label} · 高亮仅表示选择，健康度待接入
      </p>
    </Panel>
  );
}

export function BridgeHealth({
  bridge: b,
  onArchive,
}: {
  bridge: Bridge;
  onArchive: () => void;
}) {
  const { selection, select, parts } = useStructure();
  return (
    <Panel title="健康状态" note="来源可追溯" className="bridge-health-column">
      <div className="health-tree">
        <small className="health-level">全桥整体</small>
        <button
          className={`health-node overall health-select ${selection === "all" ? "structure-active" : ""}`}
          aria-pressed={selection === "all"}
          onClick={() => select("all")}
        >
          <strong>
            整体 <em>—</em>
          </strong>
          <span>综合评分尚未接入</span>
        </button>
        <div className="health-children">
          <small className="health-level">组成部位 · 点击联动示意图</small>
          {ZONES.map((zone) => (
            <div className="health-branch" key={zone}>
              <button
                className={`health-node health-select ${selection && selection !== "all" && selection.zone === zone ? "structure-active" : ""}`}
                aria-pressed={
                  selection !== "all" && !!selection && selection.zone === zone
                }
                onClick={() => select({ zone })}
              >
                <strong>
                  {zone}
                  <em>—</em>
                </strong>
                <span>暂无评价 · 选择部位</span>
              </button>
              {selection && selection !== "all" && selection.zone === zone && (
                <div className="health-parts">
                  {parts
                    .filter((p) => p.zone === zone)
                    .map((part) => (
                      <button
                        key={part.id}
                        aria-pressed={selection.part === part.id}
                        onClick={() => select({ zone, part: part.id })}
                      >
                        {part.name}
                        <small>
                          {part.bindings.length
                            ? `${part.bindings.length}个绑定`
                            : "待绑定"}
                        </small>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="health-legend">高亮表示当前选择；“—”表示暂无健康评价</div>
      <div className="health-source-section">
        <small className="health-level">来源技术状况评价</small>
        <div className="source-grades">
          <button onClick={onArchive}>
            <small>完好状况 BCI</small>
            <b>{b.conditionGradeName}</b>
            <span>编码 {b.conditionGrade ?? "未提供"}</span>
          </button>
          <button onClick={onArchive}>
            <small>结构状况 BSI</small>
            <b>{b.structureGradeName}</b>
            <span>编码 {b.structureGrade ?? "未提供"}</span>
          </button>
        </div>
        <p className="muted-caption">
          来源技术状况等级与综合健康度分别展示。点击来源等级可查看原始字段和缺失原因。
        </p>
      </div>
    </Panel>
  );
}
