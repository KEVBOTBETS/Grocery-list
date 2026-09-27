# Grocery List

Compare this week's grocery prices across stores near you and split your list by the cheapest store.

**Live:** https://kevbotbets.github.io/Grocery-list/

- Add items (comma separated, `2 x eggs` sets quantity) or use Quick add
- Each item is checked against this week's flyers + online prices at Walmart, Superstore, Loblaws, Sobeys, Metro, Farm Boy, FreshCo, Costco and Longo's (more stores in Settings)
- **By store** tab builds one checklist per store with totals, copy/share, and links to each store's online ordering
- Tap an item to see every store's price, pin a specific product, hide wrong matches, compare by unit price, or lock it to a store
- Trip savers suggest dropping a store when moving its 1-2 items elsewhere costs little
- Saved on the device (localStorage); installable to the home screen

Prices come from Flipp's public flyer search, fetched in the browser (no server). Always confirm at checkout.

Files: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, icons.
