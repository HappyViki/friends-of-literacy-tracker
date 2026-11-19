import { Barcode } from "./ui";

/** The family's library card, sized like a wallet card. "Print" prints only this card. */
export function LibraryCard({ number, name, location }: { number: string; name: string; location?: string }) {
  return (
    <div className="library-card-wrap">
      <div className="library-card print-card">
        <div className="lc-top">
          <span className="lc-brand">📚 Little Readers</span>
          <span className="lc-sub">Friends of Literacy</span>
        </div>
        <div className="lc-name">{name}</div>
        <div className="lc-barcode">
          <Barcode value={number} height={44} />
        </div>
        <div className="lc-number">{number}</div>
        {location && <div className="lc-loc">Issued at {location}</div>}
      </div>
      <button type="button" className="secondary" onClick={() => window.print()}>
        🖨️ Print card
      </button>
    </div>
  );
}
