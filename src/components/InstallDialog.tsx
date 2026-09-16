import { useEffect, useRef } from 'react'
import { Ellipsis, PlusSquare, Share, X } from 'lucide-react'

export function InstallDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="install-dialog"
      aria-labelledby="install-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet-body">
        <div className="sheet-handle" />
        <button className="icon-button close-dialog" onClick={onClose} aria-label="關閉安裝說明">
          <X size={22} />
        </button>
        <h2 id="install-title">加入主畫面</h2>
        <p>在 iPhone 上，請先用 Safari 開啟這個網站。</p>
        <ol className="install-steps">
          <li>
            <span className="step-number">1</span>
            <span>
              打開 Safari 選單 <Ellipsis size={18} />
              ，找到「分享」
              <Share size={18} />
              。部分版本可直接點分享按鈕。
            </span>
          </li>
          <li>
            <span className="step-number">2</span>
            <span>
              往下找到 <PlusSquare size={18} />
              「加入主畫面」。
            </span>
          </li>
          <li>
            <span className="step-number">3</span>
            <span>若有「以網頁 App 打開」，請保持開啟，再按「加入」。</span>
          </li>
        </ol>
        <p className="quiet-note">
          加入後，從主畫面開啟一次，等「可離線開啟」出現，再試試飛航模式。
        </p>
        <details>
          <summary>Android 或電腦怎麼安裝？</summary>
          <p>
            在支援安裝的瀏覽器選單中，選擇「安裝應用程式」或「加入主畫面」。也可以直接在瀏覽器使用。
          </p>
        </details>
        <button className="primary-button full-width" onClick={onClose}>
          知道了
        </button>
      </div>
    </dialog>
  )
}
