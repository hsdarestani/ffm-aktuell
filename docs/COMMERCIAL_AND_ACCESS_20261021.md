# Editable commercial decisions and delegated access

## Decisions implemented

No native app or email work is included. Web subscriptions use Stripe hosted Checkout and its customer portal. The initial price proposals, included features, staff capacity, branch limits and trial are editable in Administration → Tarife. They are drafts until the operator supplies a real HTTPS contract link and releases the tariff. No fictitious legal agreement, approval or payment is inserted.

| Tariff | Month including applicable taxes | Year including applicable taxes | Trial | Staff | Branches |
| --- | --- | --- | --- | --- | --- |
| Personal Premium | EUR 4.90 | EUR 49.00 | 7 days, first subscription only | 0 | 1 |
| Business Premium 1 | EUR 19.90 | EUR 199.00 | None | 3 | 3 |
| Business Premium 2 | EUR 39.90 | EUR 399.00 | None | 10 | 20 |

Personal Premium starts with exclusive deals, advanced personal discovery and tour comfort. Business 1 includes extended profile, Stories, analytics and staff; Business 2 also includes campaign tools and priority support. Feature codes are a central configurable catalogue. Existence of a feature code does not assert that every associated workflow is complete; consult the implementation ledger.

Existing independent administrative seat allocations remain explicit overrides. Otherwise only a currently active or trialing paid snapshot grants extra capacity. Surplus staff remain in history but lose access automatically in deterministic join order when capacity drops. The free business branch limit is one. Branch claim approval serializes company and venue rows before checking capacity. Historical agreements are immutable price/feature snapshots; editing a plan changes subsequent checkouts and explicit customer-portal changes, not already contracted benefits silently.

## Payments and lifecycle

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` through `FFM_SERVICES_JSON`. The production Compose environment passes both to the web container. Use separate staging and production databases/accounts for test and live modes. Configure provider account identity, payout/tax settings and contract URL using real operator data. These cannot be inferred from an API key. Checkout requests card/SEPA, inclusive prices, billing address, automatic tax and affirmative agreement. No real provider request or charge is made by the repository tests.

Register `https://ffm-aktuell.smarbiz.sbs/api/billing/webhook` for:

- `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`
- `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`
- `charge.refunded`, `credit_note.created`, `credit_note.updated`, `credit_note.voided`

Only signed raw provider events synchronize entitlements. The browser success URL grants nothing. A per-customer transaction lock and event receipt ledger prevent duplicate handling; current provider state is retrieved so reordered old events cannot restore canceled access. Pending checkout is unique per scope and expires in 35 minutes. Failed post-creation commits attempt to expire the orphan session. A second active subscription for the same scope is rejected.

Paid and trialing access ends at the recorded provider period boundary. Past-due, incomplete, paused, unpaid and canceled states grant no paid benefits. Default grace is zero. Portal cancellation takes effect at the paid period end; upgrades/downgrades use explicit provider confirmation and invoice proration. Provider invoices, credit notes and cumulative charge refunds are recorded. A full refund linked to the latest invoice suspends that period's benefits; partial refunds keep them. An actual subsequent paid renewal can restore access. Refund initiation is an operator action in the authenticated provider dashboard; the public app cannot issue arbitrary refunds.

Account deletion rejects live subscriptions and unexpired checkouts with a clear explanation. Past financial records retain pseudonymous IDs and required accounting facts; user links become null. No card details are stored. Account export includes subscription/invoice facts and delegated roles. Qualified operator review of tax, cancellation, legal retention and contract copy remains necessary before live commercial activation.

## Department roles

Existing `users.role=admin` accounts remain the root authority. Delegated accounts retain their ordinary user role and acquire explicit permissions from editable roles: editorial, moderation, business/support, marketing, finance and operations. Menus and API guards both enforce the assigned capability. Moderation queues return only authorized departments. Only a root administrator can change role definitions and assignments, with a fresh authentication and an audit reason. A role change/revocation is effective on the next request without waiting for the old session to expire.

Business owners can restrict each viewer/editor to all branches or named branches. Invites copy this scope on acceptance. Restricted staff cannot read/edit other branches or company-wide analytics. Removing access applies immediately. An editor can propose changes but cannot self-publish. Scope changes validate every branch against the owning business.

## Validation and limits

Behavioral PostgreSQL tests cover expiration, genuine Stripe signature verification, replay/reordering, failed invoice suspension, refund suspension, invoice/credit persistence, rollback/retry and repeatable default migrations. Disposable real PostgreSQL HTTP CI covers delegated permissions and escalation/revocation, branch read/write isolation, paid analytics and expiry. Live Stripe checkout, SEPA, taxes, card challenges, portal changes and refund processing require actual provider test-account acceptance after credentials are configured. Passing local tests is not a claim of that live acceptance.

References: https://docs.stripe.com/webhooks , https://docs.stripe.com/api/checkout/sessions/create , https://docs.stripe.com/api/customer_portal/sessions/create . Stripe SDK version is locked in package-lock.json; its generated types define the pinned provider API request fields.
