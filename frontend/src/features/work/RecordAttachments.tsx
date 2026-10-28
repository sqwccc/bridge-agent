import { useEffect, useState } from "react";
import { Modal } from "antd";
import type { Report } from "../../api/types";

/** 附件经同源接口读取，失败显示在当前记录内，关闭预览后释放 Blob。 */
export function RecordAttachments({
  attachments,
  basePath,
}: {
  attachments: Report[];
  basePath: string;
}) {
  const [preview, setPreview] = useState<{
    name: string;
    url: string;
    image: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  async function read(file: Report, download: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/${basePath}/attachments/${encodeURIComponent(file.id)}/file?download=${download}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event("session-expired"));
        throw new Error(
          (await response.json().catch(() => null))?.message || "附件读取失败",
        );
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        const encoded = (
          response.headers.get("content-disposition") || ""
        ).match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        let name = file.name + (file.pdf ? ".pdf" : "");
        if (encoded) {
          try {
            name = decodeURIComponent(encoded);
          } catch {
            /* 保留元数据名称 */
          }
        }
        link.download = name.replace(/[\\/\r\n]/g, "_");
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else
        setPreview({
          name: file.name,
          url,
          image: file.attachmentKind === "IMAGE",
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "附件读取失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="record-attachments">
      {!attachments.length ? (
        <p className="muted-caption">来源未提供附件。</p>
      ) : (
        attachments.map((file) => (
          <article key={file.id}>
            <div>
              <strong>{file.name}</strong>
              <small>{file.statusReason}</small>
            </div>
            {file.status === "AVAILABLE" && (
              <div className="inline-tools">
                {(file.pdf || file.attachmentKind === "IMAGE") && (
                  <button
                    disabled={busy}
                    onClick={() => void read(file, false)}
                  >
                    预览附件
                  </button>
                )}
                <button disabled={busy} onClick={() => void read(file, true)}>
                  下载附件
                </button>
              </div>
            )}
          </article>
        ))
      )}
      {error && (
        <p role="alert" className="file-read-error">
          {error}
        </p>
      )}
      <Modal
        title={preview?.name}
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={null}
        width="80vw"
        destroyOnHidden
      >
        {preview &&
          (preview.image ? (
            <img
              className="report-image"
              src={preview.url}
              alt={preview.name}
            />
          ) : (
            <iframe
              className="pdf-frame"
              title="记录附件 PDF 预览"
              src={preview.url}
            />
          ))}
      </Modal>
    </div>
  );
}
