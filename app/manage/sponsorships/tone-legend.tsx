import {
  DONATION_STATUS_LABELS,
  DONATION_STATUS_ORDER,
  statusTone,
} from "@/lib/sponsorship-types";

/**
 * What the colours mean, at the foot of every screen that uses them.
 *
 * The same legend on all three, rather than one page carrying the key for the
 * others: somebody who arrived by a link and is reading a sponsor's history
 * should not have to go up a level to find out what grey stands for.
 *
 * Money is read by status, because the difference between a cheque banked and a
 * cheque promised is the whole question. An in-kind donation is not money and never
 * becomes money, so it is read only as arrived or not.
 */
export function ToneLegend() {
  const money = DONATION_STATUS_ORDER.map((status) => ({
    tone: statusTone(status),
    label: DONATION_STATUS_LABELS[status],
  }));

  return (
    <section className="tone-legend" aria-label="What the colours mean">
      <div>
        <span className="field-label">Money</span>
        <ul>
          {money.map((entry) => (
            <li key={entry.tone} className={entry.tone}>
              <span className="tone-dot" aria-hidden="true" />
              {entry.label}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="field-label">In-kind</span>
        <ul>
          <li className="tone-in-kind">
            <span className="tone-dot" aria-hidden="true" />
            Received
          </li>
          <li className="tone-in-kind-pending">
            <span className="tone-dot" aria-hidden="true" />
            To come
          </li>
          <li className="tone-cancelled">
            <span className="tone-dot" aria-hidden="true" />
            Cancelled
          </li>
        </ul>
      </div>
    </section>
  );
}
