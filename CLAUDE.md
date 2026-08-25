# Claude Instructions

## Response Style
- Har response mein structured format do (tables, lists, code blocks)
- Technical explanation ke saath practical examples do
- Confidence ke saath answer do, confusion mat dikhao
- Summary/stats tables use karo jab data ho
- Bold aur headers use karo readability ke liye

## Technical Approach
- **TypeScript-first**: Type safety ko priority do, `any` avoid karo
- **Production-ready code**: Error handling, validation, edge cases include karo
- **Security**: Input sanitization, auth checks, rate limiting consider karo
- **Performance**: Database queries optimize karo, unnecessary API calls avoid karo
- **PRs/Commits**: Clear, descriptive messages likho

## Code Quality
- ESLint/Prettier conventions follow karo jo project mein hai
- Consistent naming convention use karo
- Comments complex logic ke liye, straightforward code ke liye nahi
- Small, focused functions likho (single responsibility)

## Copyright & Attribution
- Kisi bhi source se 15+ words directly mat copy karo
- Ek source se ek quote maximum, baaki paraphrase
- Song lyrics, poems reproduce mat karo

## Project Context
- Node.js/Express backend, React frontend
- Prisma ORM, PostgreSQL database
- Docker/Coolify deployment
- Express middleware pattern follow karo
- `string | string[]` type issues fix karo specifically

## Communication
- Technical terms English mein, explanation Hindi mein
- Direct replies without unnecessary hedging
- Action items clearly marked with ✅ ❌ 🎯 emojis
- Step-by-step instructions numbered list mein do
- Lead with warmth, negative assumptions mat karo
- Ek response mein sirf ek question pucho
- Simple queries ke liye prose use karo, complex ke liye lists/tables

## When Responding
- Default to prose for simple queries
- Complex topics ke liye structured format (tables, bullets, bold headers)
- Code examples ke saath explain karo
- Confidence ke saath answer do, confusion mat dikhao
- Refuse karne mein empathy do, no lengthy explanations


## API & Rate Limiting

- Batch operations use karo whenever possible
- Unnecessary API calls avoid karo - pehle check karo kya realmente needed hai
- Cache responses wherever appropriate
- Rate limit exhaust hone se pehle hi throttle karo

## When Using Tools/Agents

- Ek agent ko kaam do, baad mein doosra - unnecessary parallelization mat karo
- Sirf tabhi agent spawn karo jab genuinely independent kaam ho
- API load ko spread karo time pe, cluster mat karo

## When Fixing Issues
1. Root cause pehle identify karo
2. Ek change at a time karo
3. Test verify karo
4. Commit message descriptive likho

## File Organization
- Route handlers: `src/server/routes/`
- Middleware: `src/server/middleware/`
- Services: `src/server/services/`
- Types: `src/server/types/`
- Utils: `src/server/utils/`

## Database (Prisma)
- `npx prisma generate` baar baar karo schema change ke baad
- Model names camelCase, Prisma queries mein correct convert hote hain
- Include relations explicitly jab needed ho

## Docker/Deployment
- Environment variables ko secure rakho
- `.env.example` updated rakhna for documentation
- Production compose alag hai dev se - dhyan rakho