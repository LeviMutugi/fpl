/**
 * The screen-reader twin of a plot. A tooltip must never be the only way to
 * read a value, so the data-heavy charts render this alongside the SVG.
 */
export type ChartTableProps = {
  /** Describes what the plot shows; announced before the rows. */
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  /** Render it visibly instead of only for assistive tech. */
  visible?: boolean;
};

export function ChartTable({ caption, columns, rows, visible = false }: ChartTableProps) {
  if (rows.length === 0) return null;

  return (
    <table className={visible ? 'num w-full text-left text-[12px]' : 'sr-only'}>
      <caption className={visible ? 'sr-only' : undefined}>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row[0] ?? ''}-${index}`}>
            {row.map((cell, cellIndex) =>
              cellIndex === 0 ? (
                <th key={columns[cellIndex] ?? cellIndex} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={columns[cellIndex] ?? cellIndex}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
