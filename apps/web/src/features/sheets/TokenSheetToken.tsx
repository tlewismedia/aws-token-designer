import Button from '../../components/Button/Button'
import './TokenSheetToken.css'

type Props = {
  url?: string
  index: number
  sheetId: string
  handleDelete: (sheetId: string, index: number) => Promise<unknown>
  onImageReady?: (url: string) => void
}

export default function TokenSheetToken({
  url,
  index,
  sheetId,
  handleDelete,
  onImageReady,
}: Props) {
  return (
    <div className="token">
      {url ? (
        <img
          src={url}
          alt=""
          loading="eager"
          decoding="sync"
          onLoad={() => onImageReady?.(url)}
          onError={() => onImageReady?.(url)}
        />
      ) : (
        // The sheet references an image the gallery no longer has (deleted or
        // not loaded yet): keep a tile so indices stay aligned with the
        // server-side `sheet.images` array.
        <div className="token-placeholder" aria-label="Unresolved token" />
      )}

      <Button
        className="remove-token"
        onClick={() => {
          void handleDelete(sheetId, index)
        }}
        size="small"
        aria-label={`Remove token ${index + 1}`}
      >
        X
      </Button>
    </div>
  )
}
