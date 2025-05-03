
## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```
### Supabase

For security purposes, since I want to continue with this project, I am not including the anonkey and url.

However, it is attached to the assignment / email me, and add it to .env.local to run any database functionalities, as otherwise things won't populate.

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
