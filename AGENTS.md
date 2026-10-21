<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Verification state machine is server-authoritative; the frontend only renders backend-reported state (src/lib/verification/contract.ts is the contract). Why: hackathon requires backend-enforced transitions.
- Never persist uploaded document contents or extracted PII. Why: privacy requirement.
- Status indicators must stay honest: show "not connected" until a backend path is implemented and tested.
- The verification backend is the standalone dependency-free Node server in `server/` (one long-running instance), not TanStack server routes or Edge Functions. Why: serverless isolates cannot hold a shared in-memory event log across requests.
- Server tests run with `npm test` inside `server/`; keep one test per rule there.
