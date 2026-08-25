# TODO - Ava Executive Assistant Operational Voice Actions

- [ ] Fix frontend -> backend contract: `src/services/ava.service.ts` should send `{ command, params }` (backend `/api/ava/command` expects `params`).
- [ ] Extend voice command parsing in `src/components/AvaExecutiveAssistant.tsx` to detect “trigger workflow/run automation…”.
- [ ] Implement backend dispatcher support in `src/server/routes/ava.ts`:
  - add `trigger_workflow` branch inside `/api/ava/command`
  - validate `workflowId`
  - trigger via existing n8n webhook logic (similar to `/api/ava/n8n/trigger`)
- [ ] Add safety confirmation logic for sensitive actions (delete/cancel) where applicable.
- [ ] Run verification:
  - [ ] `npm test`
  - [ ] `npm run typecheck`
  - [ ] Quick smoke calls for `/api/ava/command` with `trigger_workflow`.
