## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Supabase

For security purposes, I am not including the anonkey and url.

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy the app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

# Background

The original motivation for the project is from a design team I am involved with at Virginia Tech called the Archimedes Society. This design team provides opportunities for freshman to be involved in design teams and engineering projects early on in their college careers. 
One of the difficulties in running an organization like this is recruiting, and it takes a non traditional approach towards scheduling interviews.
Rather than having candidates be given interview slots, we consider their availability first. There are softwares like calendly which can do this, the issue is we want it to be blind, as there is a group interview. 

Hence, I built out software to schedule everyone based on their availability, both candidate and interviewers. 

The current production version is private in the Archimedes github org, and built out to fit the specific branding and design of the organization, and this public starting point serves as a way to build out your own custom ATS software.

# Internal Notes

Go to src for all of the actual website code. 

Go to the algo folder for running any algo.

Otherwise look at the supabase for the backend/db. 