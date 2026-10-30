import type { StatusCounts } from '../digest/types.js';
import type { Status } from '../status.js';

function countsText(counts: StatusCounts | null): string {
  return counts === null ? '—' : `ok ${counts.ok} · retry ${counts.retry} · fail ${counts.fail}`;
}

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map(({ night, counts }) => (
            <li>
              <a href={`/digest/${night}`}>{night}</a> <span class="mute">{countsText(counts)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
