import { useMemo, useState } from "react";
import { Drawer, Modal, Select, Input, Button, Tabs } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, put } from "../../api/client";
import {
  ZONES,
  bindingKey,
  structureQuery,
  type StructureConfig,
  type StructurePart,
} from "../../api/structure";
import { useStructure } from "./BridgeStructure";

export function StructureEditor() {
  const { bridgeId, config, points, select } = useStructure();
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<StructureConfig | null>(null),
    [baseline, setBaseline] = useState("");
  const [activeZone, setActiveZone] = useState<string>(ZONES[0]);
  const [modal, holder] = Modal.useModal();
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const load = async () => {
    const result = await config.refetch();
    if (!result.data || result.error) {
      setError("配置加载失败，请重试");
      return;
    }
    const next = structuredClone(result.data);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setError("");
    setConflict(false);
    setActiveZone(ZONES[0]);
    setOpen(true);
  };
  const begin = async () => {
    setBusy(true);
    setError("");
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (busy) return;
    if (dirty)
      modal.confirm({
        title: "放弃未保存的部件修改？",
        content: "关闭后，本次草稿将丢失。",
        okText: "放弃修改",
        cancelText: "继续编辑",
        onOk: () => setOpen(false),
      });
    else setOpen(false);
  };
  const change = (id: string, patch: Partial<StructurePart>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            parts: d.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          }
        : d,
    );
  const save = async () => {
    if (!draft) return;
    const seen = new Set<string>();
    for (const part of draft.parts) {
      const name = part.name.trim();
      if (!name) {
        setActiveZone(part.zone);
        setError("请填写所有部件名称");
        return;
      }
      const key = part.zone + ":" + name;
      if (seen.has(key)) {
        setActiveZone(part.zone);
        setError("同一部位的部件名称不能重复");
        return;
      }
      seen.add(key);
    }
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      const saved = await put<StructureConfig>(
        `bridges/${encodeURIComponent(bridgeId)}/structure-config`,
        draft,
      );
      client.setQueryData(structureQuery(bridgeId).queryKey, saved);
      setDraft(saved);
      setBaseline(JSON.stringify(saved));
      setOpen(false);
      select(null);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  };
  const available = new Map((points.data || []).map((p) => [bindingKey(p), p]));
  const groupedPoints = useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        options: {
          value: string;
          label: string;
          searchText: string;
          disabled?: boolean;
        }[];
      }
    >();
    for (const point of points.data || []) {
      const key = JSON.stringify([point.metric, point.unit]);
      const metric =
        point.metricName ||
        point.metric ||
        (point.metric === "" ? "空指标" : "未指定指标");
      if (!groups.has(key))
        groups.set(key, {
          label: metric + (point.unit ? " · " + point.unit : ""),
          options: [],
        });
      const label =
        (point.pointName || point.pointId) +
        " / " +
        (point.deviceName || point.deviceId);
      groups.get(key)!.options.push({
        value: bindingKey(point),
        label,
        searchText: [label, point.pointId, point.deviceId, metric]
          .join(" ")
          .toLowerCase(),
      });
    }
    return [...groups.values()];
  }, [points.data]);
  return (
    <>
      {holder}
      <button onClick={() => void begin()} disabled={busy || !config.data}>
        编辑部件
      </button>
      {!open && error && <span role="alert">{error}</span>}
      <Drawer
        title="编辑桥梁部件"
        open={open}
        onClose={close}
        size={960}
        styles={{ wrapper: { maxWidth: "100vw" } }}
        maskClosable={!busy}
        keyboard={!busy}
        className="structure-editor"
        footer={
          <div>
            <span
              className={
                dirty ? "editor-save-status is-dirty" : "editor-save-status"
              }
            >
              {dirty ? "有未保存修改" : "所有修改已保存"}
            </span>
            <Button disabled={busy} onClick={close}>
              取消
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!dirty}
              onClick={() => void save()}
            >
              保存配置
            </Button>
          </div>
        }
      >
        <div className="editor-overview">
          <div>
            <strong>配置本桥结构部件</strong>
            <p>按部位管理部件，并手动关联监测序列。</p>
          </div>
          <div className="editor-total">
            <b>{draft?.parts.length || 0}</b>
            <span>个部件</span>
          </div>
        </div>
        <Tabs
          className="editor-zone-tabs"
          activeKey={activeZone}
          onChange={setActiveZone}
          items={ZONES.map((zone) => ({
            key: zone,
            label: (
              <span>
                {zone}
                <em>
                  {draft?.parts.filter((p) => p.zone === zone).length || 0}
                </em>
              </span>
            ),
          }))}
        />
        {error && (
          <div role="alert">
            {error}
            {conflict && (
              <Button
                onClick={() =>
                  modal.confirm({
                    title: "重新加载会放弃当前草稿",
                    okText: "重新加载",
                    cancelText: "保留草稿",
                    onOk: load,
                  })
                }
              >
                重新加载配置
              </Button>
            )}
          </div>
        )}
        {points.error && (
          <div role="alert">
            测点列表加载失败，暂不能选择新的绑定。
            <button onClick={() => void points.refetch()}>重试测点</button>
          </div>
        )}
        {points.isPending && <p role="status">正在读取本桥测点…</p>}
        {ZONES.filter((zone) => zone === activeZone).map((zone) => (
          <section key={zone} className="structure-edit-zone">
            <div className="editor-zone-heading">
              <h3>{zone}</h3>
              <span>测点可共用 · 未绑定也可保存</span>
            </div>
            {!draft?.parts.some((p) => p.zone === zone) && (
              <div className="editor-empty">暂无部件，点击下方按钮添加</div>
            )}
            {draft?.parts
              .filter((p) => p.zone === zone)
              .map((part) => {
                const missing = part.bindings.filter(
                  (b) => !available.has(bindingKey(b)),
                );
                const options = [
                  ...groupedPoints,
                  ...(missing.length
                    ? [
                        {
                          label: points.data ? "已失效绑定" : "待核验绑定",
                          options: missing.map((b) => ({
                            value: bindingKey(b),
                            label: b.pointId + " / " + b.deviceId,
                            searchText: (
                              b.pointId +
                              " " +
                              b.deviceId
                            ).toLowerCase(),
                            disabled: true,
                          })),
                        },
                      ]
                    : []),
                ];
                return (
                  <div
                    key={part.id}
                    className="structure-edit-part"
                    data-part-id={part.id}
                  >
                    <div className="part-editor-heading">
                      <span className="editor-part-kind">
                        {part.anchor
                          ? "默认部件 · 保留图形关联"
                          : "自定义部件 · 部位范围示意"}
                      </span>
                      <Button
                        danger
                        type="text"
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  parts: d.parts.filter(
                                    (p) => p.id !== part.id,
                                  ),
                                }
                              : d,
                          )
                        }
                      >
                        删除部件
                      </Button>
                    </div>
                    <div className="editor-part-fields">
                      <label>
                        部件名称
                        <Input
                          aria-label={`${part.id} 部件名称`}
                          value={part.name}
                          maxLength={80}
                          disabled={busy}
                          onChange={(e) =>
                            change(part.id, { name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        说明 <span className="editor-optional">选填</span>
                        <Input.TextArea
                          aria-label={`${part.id} 说明`}
                          value={part.description}
                          maxLength={1000}
                          disabled={busy}
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          placeholder="补充部件位置或用途"
                          onChange={(e) =>
                            change(part.id, { description: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="editor-binding-field">
                      绑定测点（设备及指标）
                      <Select
                        mode="multiple"
                        maxTagCount={0}
                        maxTagPlaceholder={() =>
                          `已绑定 ${part.bindings.length} 个测点`
                        }
                        classNames={{
                          popup: { root: "structure-point-options" },
                        }}
                        showSearch
                        optionFilterProp="searchText"
                        notFoundContent="未找到匹配的测点或设备"
                        listHeight={320}
                        optionRender={(option) => {
                          const point = available.get(String(option.value));
                          const bound = part.bindings.some(
                            (b) => bindingKey(b) === option.value,
                          );
                          return (
                            <div className="binding-option">
                              <div className="binding-option-title">
                                <strong>
                                  {point?.pointName ||
                                    point?.pointId ||
                                    option.label}
                                </strong>
                                {bound && <span>已绑定</span>}
                              </div>
                              {point && (
                                <>
                                  <div className="binding-option-device">
                                    设备：{point.deviceName || point.deviceId}
                                  </div>
                                  <div className="binding-option-ids">
                                    测点 {point.pointId} · 设备 {point.deviceId}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        }}
                        aria-label={`${part.id} 绑定测点`}
                        value={part.bindings.map(bindingKey)}
                        options={options}
                        disabled={busy || points.isPending || !!points.error}
                        placeholder={
                          points.data?.length === 0
                            ? "本桥暂无可绑定测点，可先保存"
                            : "搜索测点名称或设备名称"
                        }
                        onChange={(keys: string[]) =>
                          change(part.id, {
                            bindings: keys.map((k) => {
                              const [pointId, deviceId, metric] = JSON.parse(k);
                              return { pointId, deviceId, metric };
                            }),
                          })
                        }
                      />
                    </label>
                    <small>
                      {!part.bindings.length
                        ? "待绑定测点"
                        : `${part.bindings.length}个绑定`}
                    </small>
                    {!!part.bindings.length && (
                      <ul className="bound-point-list" aria-label="已绑定测点">
                        {part.bindings.map((binding) => {
                          const key = bindingKey(binding),
                            point = available.get(key);
                          return (
                            <li
                              key={key}
                              className={!point ? "is-unresolved" : ""}
                            >
                              <div className="bound-point-detail">
                                <strong>
                                  {point?.pointName || binding.pointId}
                                </strong>
                                <span>
                                  设备：{point?.deviceName || binding.deviceId}
                                </span>
                                <span className="bound-point-metric">
                                  {point?.metricName ||
                                    binding.metric ||
                                    (binding.metric === ""
                                      ? "空指标"
                                      : "未指定指标")}
                                  {point?.unit ? " · " + point.unit : ""}
                                  {!point &&
                                    (points.data ? " · 已失效" : " · 待核验")}
                                </span>
                                <span className="binding-option-ids">
                                  测点 {binding.pointId} · 设备{" "}
                                  {binding.deviceId}
                                </span>
                              </div>
                              <Button
                                type="text"
                                size="small"
                                disabled={busy}
                                aria-label={
                                  "移除绑定 " +
                                  (point?.pointName || binding.pointId) +
                                  " / " +
                                  (point?.deviceName || binding.deviceId)
                                }
                                onClick={() =>
                                  change(part.id, {
                                    bindings: part.bindings.filter(
                                      (b) => bindingKey(b) !== key,
                                    ),
                                  })
                                }
                              >
                                移除
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {points.data &&
                      part.bindings.some(
                        (b) => !available.has(bindingKey(b)),
                      ) && (
                        <p role="status">
                          存在已失效绑定，可移除或重新选择；不会自动替换。
                        </p>
                      )}
                  </div>
                );
              })}
            <Button
              className="editor-add-part"
              type="dashed"
              block
              disabled={busy}
              onClick={() =>
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        parts: [
                          ...d.parts,
                          {
                            id: crypto.randomUUID(),
                            zone,
                            name: "",
                            description: "",
                            anchor: null,
                            bindings: [],
                          },
                        ],
                      }
                    : d,
                )
              }
            >
              添加{zone}部件
            </Button>
          </section>
        ))}
      </Drawer>
    </>
  );
}
