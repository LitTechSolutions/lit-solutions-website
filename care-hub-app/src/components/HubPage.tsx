import { Link } from "react-router-dom";

export interface HubCard {
  to: string;
  title: string;
  body: string;
}

/**
 * Shared shape for the customer-facing "hub" landing pages (Project,
 * Your Website, Billing) introduced alongside the simplified customer
 * nav -- a short intro plus a grid of cards, each linking straight to an
 * existing, unchanged route (ScopeOfWork, WebsiteProfiles, etc.). Purely
 * a navigation layer: none of these cards fetch or duplicate the data
 * the linked-to screens already own.
 */
export function HubPage({ title, intro, cards }: { title: string; intro: string; cards: HubCard[] }) {
  return (
    <div>
      <h1>{title}</h1>
      <p style={{ color: "var(--ink-soft)", marginTop: "var(--space-2)", maxWidth: "60ch" }}>{intro}</p>
      <div className="hub-grid" style={{ marginTop: "var(--space-5)" }}>
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="hub-tile">
            <span className="hub-tile__title">{card.title}</span>
            <span className="hub-tile__desc">{card.body}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
