import type { DigestNight, DigestRow } from '../digest/types.js';

// Missing data is a dash, never an empty cell (styleguide).
function show(value: string | null): string {
  return value === null || value.trim() === '' ? '—' : value;
}

// Retries of 3 or more, and any last `fail`, are marked. The marking is never color alone: the
// status text and the retries number are in the row, and the note under the table says why.
function isWarn(row: DigestRow): boolean {
  return row.retries >= 3 || row.lastStatus === 'fail';
}

export function DigestPage({ digest }: { digest: DigestNight }) {
  const { night, rows, badLines, counts } = digest;
  return (
    <>
      <h1>{`digest · ${night}`}</h1>
      <p>{`ok ${counts.ok} · retry ${counts.retry} · fail ${counts.fail} · bad lines ${badLines}`}</p>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>job</th>
                <th>owner</th>
                <th>runs</th>
                <th>retries</th>
                <th>last status</th>
                <th>last error</th>
                <th>first</th>
                <th>last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr class={isWarn(row) ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{show(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{show(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="mute">highlighted rows: 3 or more retries, or last status fail.</p>
        </>
      )}
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return (
    <>
      <h1>{`digest · ${night}`}</h1>
      <p>{`no run log for ${night}`}</p>
    </>
  );
}
