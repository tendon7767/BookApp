export function SeriesFields({
  name,
  onName,
  names,
  disabled,
  listId,
}: {
  name: string
  onName: (name: string) => void
  names: string[]
  disabled: boolean
  listId: string
}) {
  return (
    <>
      <label>
        系列
        <input
          maxLength={100}
          list={listId}
          value={name}
          onChange={(e) => onName(e.target.value)}
          disabled={disabled}
          placeholder="輸入或選擇系列；留白移出系列"
        />
      </label>
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  )
}

export function VolumeField({
  label = '集數',
  value,
  onChange,
  disabled,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min="0.01"
        max="9999"
        step="any"
        placeholder="可留白"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  )
}
