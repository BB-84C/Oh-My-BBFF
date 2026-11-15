# Oh-My-BBFF Hello — minimal module example

The smallest complete Oh-My-BBFF module: a host half that registers the family
descriptor and a client half that contributes one status card and one BBFF
settings section.

- `index.js` — host plugin: `registerFamilyModule(ctx, descriptor)`.
- `client.js` — DSH client bundle: registers a card/section into `bbffUi`.
- `cordis.patch.yml` — inserts the host plugin into the profile.
- `package.json` — `bbff` metadata, bundle patch, client manifest.
- `locale/{en,zh}.json` — plugin-list title/description.

Registration is injection-based, so load order does not matter:

- root absent → `ctx.inject` never fires and the module still works standalone;
- root present later or HMR-reloaded → the injection fires and registers;
- root unload → the registered card/section disappears.

The root owns card chrome (drag/dock/split/collapse/resize/persistence) and the
BBFF settings seat; the example only supplies title, order, height and body.

To use the typed SDK helpers in your own module, `npm i oh-my-bbff-sdk` and
bundle the client half with the helper inlined (React stays external and is
provided by the DSH client loader):

```sh
npx esbuild client.source.js --bundle --format=iife --platform=browser --external:react --outfile=client.js
```
