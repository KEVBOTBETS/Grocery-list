"""Daily grocery price tracker for the Grocery List app.

Reads watch.json, checks this week's flyer + online prices on Flipp for each item,
keeps a weekly best-price history in data/history.json (used for the app's
"lowest in X weeks" badges) and sends ntfy push alerts when a deal hits.
Standard library only.
"""
import json, os, re, sys, unicodedata, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://backflipp.wishabi.com/flipp/items/search"
SITE = "https://kevbotbets.github.io/Grocery-list/"
KEEP_WEEKS = 26

STORES = {  # id -> normalized Flipp merchant names (same as app.js)
    "walmart": ["walmart"], "superstore": ["realcanadiansuperstore", "pcexpressrapiddelivery"], "loblaws": ["loblaws"],
    "sobeys": ["sobeys", "voila"], "metro": ["metro"], "farmboy": ["farmboy", "farmboymarketsltd"], "freshco": ["freshco"],
    "costco": ["costco"], "longos": ["longos"], "nofrills": ["nofrills"], "foodbasics": ["foodbasics"],
    "wholesale": ["wholesaleclubandclubentrepot", "wholesaleclub"], "yig": ["yourindependentgrocer"], "tnt": ["ttsupermarket"],
    "shoppers": ["shoppersdrugmart"], "gianttiger": ["gianttiger"],
}
NAMES = {"walmart": "Walmart", "superstore": "Superstore", "loblaws": "Loblaws", "sobeys": "Sobeys", "metro": "Metro", "farmboy": "Farm Boy",
         "freshco": "FreshCo", "costco": "Costco", "longos": "Longo's", "nofrills": "No Frills", "foodbasics": "Food Basics",
         "wholesale": "Wholesale Club", "yig": "Independent", "tnt": "T&T", "shoppers": "Shoppers", "gianttiger": "Giant Tiger"}
M2S = {m: sid for sid, ms in STORES.items() for m in ms}

STOP = {"the", "and", "or", "of", "a", "an", "for", "with", "fresh", "x"}
FOLLOW_STOP = set("""chocolate chocolates bar bars bread breads cake cakes cupcakes chips crisps muffin muffins cookie cookies creamer creamers
whitener machine machines maker makers filter filters noodle noodles roll rolls sauce sauces seasoning flavour flavoured flavored candy
candies pudding puddings juice juices drink drinks shampoo soap lotion candle candles scented mug mugs bowl bowls dish dishes toy toys
treat treats popsicle popsicles loaf loaves pie pies tart tarts danish squares wafers bites jerky dog cat pet bath body powder spread dip
dips syrup syrups rice side crackers cereal cereals granola gummies gels cups ice freezies lip balm wash cleaner""".split())
PRECEDE_STOP = set("""chocolate chocolated coconut almond oat soy cashew peanut body cocoa shea dog cat pet baby evaporated condensed
powdered goat hemp rice pistachio apple""".split())
SYNONYMS = [(re.compile(r"\bapplesauce\b"), "apple sauce"), (re.compile(r"\bminis\b"), "mini")]


def norm_key(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)))


def norm_text(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9.]+", " ", s).strip()


def with_syn(t):
    for rx, rep in SYNONYMS:
        t = rx.sub(rep, t)
    return t


def relevant(name, q, exclude="", loose=False):
    words = [w for w in with_syn(norm_text(name)).split(" ") if w]
    hay = " " + " ".join(words) + " "
    qn = with_syn(norm_text(q))
    toks = [t for t in qn.split(" ") if len(t) > 1 and t not in STOP and not t[0].isdigit()
            and t not in ("kg", "g", "l", "ml", "lb", "lbs", "pk", "pack")]
    hits = []
    for t in toks:
        stem = re.sub(r"(es|s)$", "", re.sub(r"ies$", "", t)) if len(t) > 3 else t
        idx = next((i for i, w in enumerate(words) if w.startswith(stem) and len(w) - len(stem) <= 3), -1)
        if idx < 0:
            return False
        hits.append(idx)
    if hits and not loose:
        qwords = set(qn.split(" "))
        first, last = min(hits), max(hits)
        nxt = words[last + 1] if last + 1 < len(words) else None
        prev = words[first - 1] if first > 0 else None
        if nxt in FOLLOW_STOP and nxt not in qwords:
            return False
        if prev in PRECEDE_STOP and prev not in qwords:
            return False
        for k in range(max(0, first - 3), last):
            if words[k] in PRECEDE_STOP and words[k] not in qwords and words[k] != "apple":
                return False
    for w in [norm_text(x) for x in re.split(r"[,;]+", exclude or "")]:
        if w and (" " + w) in hay:
            return False
    return True


ONLINE_OK_NEXT = set("""slices sliced shredded block blocks pack packs bag bags box value family size club jumbo large medium small original
organic natural grade bunch bunched loose bulk each ea count ct pk tub jug bottle carton can cans whole lean boneless skinless fillets fillet
thighs breasts salted unsalted white brown red green yellow plain regular classic light free range omega eggs in with by from product
multipack variety snack snacks pouches pouch cups unsweetened sweetened lb lbs kg g l ml x bread loaf""".split())


def online_head_ok(name, q):
    """Online catalogues are huge: what follows the searched words must be the end, a size, punctuation or a describing word."""
    raw = str(name or "").lower()
    words = [w for w in with_syn(norm_text(name)).split(" ") if w]
    toks = [t for t in with_syn(norm_text(q)).split(" ") if len(t) > 1 and t not in STOP and not t[0].isdigit()]
    if not toks:
        return True
    last, last_stem = -1, ""
    for t in toks:
        st = re.sub(r"(es|s)$", "", re.sub(r"ies$", "", t)) if len(t) > 3 else t
        idx = next((i for i, w in enumerate(words) if w.startswith(st) and len(w) - len(st) <= 3), -1)
        if idx > last:
            last, last_stem = idx, st
    if last < 0:
        return False
    nxt = words[last + 1] if last + 1 < len(words) else None
    if not nxt or nxt[0].isdigit() or nxt in ONLINE_OK_NEXT:
        return True
    return bool(re.search(re.escape(last_stem) + r"[a-z]{0,3}\s*[,\-\u2013(|:\u00ae\u2122]", raw))


def parse_deal(text):
    t = (text or "").lower()
    if re.search(r"\bbogo\b", t):
        return (1, 1.0)
    m = re.search(r"buy\s*(\d+)\s*(?:,\s*)?get\s*(?:the\s*)?(\d+|one|another|2nd|3rd|4th|5th)?\s*(?:one|item|of equal[^,]*?)?\s*(free|50\s*%\s*off|half\s*(?:off|price))", t)
    if not m:
        return None
    buy = int(m.group(1))
    free = int(m.group(2)) if m.group(2) and m.group(2).isdigit() else 1
    return (buy + free, free * (1.0 if "free" in m.group(3) else 0.5)) if 1 <= buy <= 6 else None


def parse_size(name):
    """(dimension, base amount) from a product name: 4 L -> ('vol', 4000), 12 x 355 mL, 680 g, 18's ..."""
    t = " " + str(name or "").lower().replace(",", ".") + " "
    m = re.search(r"(\d+)\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|oz)\b", t)
    count, amt, unit = 1, None, None
    if m:
        count, amt, unit = int(m.group(1)), float(m.group(2)), m.group(3)
    else:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|lbs?|ml|l|oz)\b", t)
        if m:
            amt, unit = float(m.group(1)), m.group(2)
    if unit:
        tot = count * amt
        mult = {"kg": ("mass", 1000), "g": ("mass", 1), "lb": ("mass", 453.592), "lbs": ("mass", 453.592), "oz": ("mass", 28.3495),
                "l": ("vol", 1000), "ml": ("vol", 1)}[unit]
        return (mult[0], tot * mult[1])
    m = re.search(r"(\d+)\s*(?:'s|\u2019s|s\b|\s?pk|\s?pack|\s?ct|\s?count|\s?rolls?|\s?eggs)\b", t)
    if m and 1 < int(m.group(1)) <= 200:
        return ("count", int(m.group(1)))
    return None


def to_cand(raw, source, now):
    merchant = raw.get("merchant_name") if source == "flyer" else raw.get("merchant")
    sid = M2S.get(norm_key(merchant))
    try:
        p = float(raw.get("current_price") or 0)
    except (TypeError, ValueError):
        return None
    if not sid or p <= 0 or not raw.get("name"):
        return None
    pre, post = str(raw.get("pre_price_text") or ""), str(raw.get("post_price_text") or "")
    n = 1
    mm = re.search(r"(\d+)\s*(?:/|for\b)", pre, re.I)
    if mm and 1 < int(mm.group(1)) < 20:
        n = int(mm.group(1))
    unit = p / n
    pl = post.strip().lower()
    per = None
    if re.match(r"^/?\s*100\s*g\b", pl):
        per_lb = unit * 4.53592
        per = "lb"
    elif re.match(r"^/?\s*lbs?\b", pl):
        per_lb, per = unit, "lb"
    elif re.match(r"^/?\s*kg\b", pl):
        per_lb, per = unit / 2.20462, "lb"
    if source == "flyer":
        vt, vf = raw.get("valid_to"), raw.get("valid_from")
        if vt and datetime.fromisoformat(vt) < now:
            return None
        if vf and datetime.fromisoformat(vf) > now:  # next week's flyer, not buyable yet
            return None
    deal = parse_deal(" ".join([pre, post, str(raw.get("sale_story") or "")]))
    price = per_lb if per else unit  # comparable price (per lb for weighed items, per item otherwise)
    if deal and not per:  # best case when buying the deal quantity
        size, free = deal
        price = unit * (size - free) / size
    return {"store": sid, "name": raw["name"], "p": round(price, 2), "per": per, "source": source, "orig": raw.get("original_price"),
            "size": None if per else parse_size(raw["name"])}


def fetch(q, postal):
    url = f"{API}?locale=en-ca&postal_code={urllib.parse.quote(postal)}&q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (grocery-list price tracker)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def best_for(item, data, stores, now):
    cands = [c for c in (to_cand(r, "flyer", now) for r in data.get("items", [])) if c]
    cands += [c for c in (to_cand(r, "ecom", now) for r in data.get("ecom_items", [])) if c]
    q, ex, loose = item.get("q") or item["name"], item.get("exclude", ""), bool(item.get("loose"))
    cands = [c for c in cands if c["store"] in stores and relevant(c["name"], q, ex, loose)
             and (loose or c["source"] == "flyer" or online_head_ok(c["name"], q))]
    if not cands and not loose:  # not in any flyer: closest online match
        cands = [c for c in (to_cand(r, "ecom", now) for r in data.get("ecom_items", [])) if c]
        cands = [c for c in cands if c["store"] in stores and relevant(c["name"], q, ex, True)]
    if not cands:
        return None, {}
    pats = []
    for p in item.get("prefer") or []:
        try:
            pats.append(re.compile(p, re.I))
        except re.error:
            pass
    score = lambda c: sum(len(pats) - i for i, rx in enumerate(pats) if rx.search(c["name"]))
    # cheapest wins (flyer or online), but a much smaller package than the rest is pushed down (same rule as the app)
    by_dim = {}
    for c in cands:
        if c["size"]:
            by_dim.setdefault(c["size"][0], []).append(c["size"][1])
    med = {d: sorted(v)[len(v) // 2] for d, v in by_dim.items() if len(v) >= 3}
    small = lambda c: 1 if c["size"] and med.get(c["size"][0]) and c["size"][1] < med[c["size"][0]] * 0.4 else 0
    cands.sort(key=lambda c: (-score(c), small(c), c["p"]))
    per_store = {}
    for c in cands:
        per_store.setdefault(c["store"], c["p"])
    return cands[0], per_store


def flyer_week(d):
    d = d.astimezone(timezone(timedelta(hours=-4))).date()  # Toronto-ish
    return (d - timedelta(days=(d.weekday() - 3) % 7)).isoformat()  # Thursday start


def notify(topic, title, msg, tags="shopping_cart"):
    req = urllib.request.Request(f"https://ntfy.sh/{urllib.parse.quote(topic)}", data=msg.encode("utf-8"), method="POST",
                                 headers={"Title": title.encode("utf-8").decode("latin-1", "ignore"), "Tags": tags, "Click": SITE})
    try:
        urllib.request.urlopen(req, timeout=20).read()
        return True
    except Exception as e:  # never fail the run over a push
        print("ntfy failed:", e)
        return False


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def main():
    watch = load(os.path.join(ROOT, "watch.json"), None)
    if not watch:
        print("no watch.json"); return 0
    postal = re.sub(r"[^A-Z0-9]", "", str(watch.get("postal", "L1M2E2")).upper())
    stores = set(watch.get("stores") or ["walmart", "superstore", "loblaws", "sobeys", "metro", "farmboy", "freshco", "costco", "longos"])
    topic = os.environ.get("NTFY_TOPIC") or watch.get("ntfyTopic")
    low_weeks = int(watch.get("newLowWeeks", 8))
    now = datetime.now(timezone.utc)
    wk = flyer_week(now)
    hist_path, sent_path = os.path.join(ROOT, "data", "history.json"), os.path.join(ROOT, "data", "alerts-sent.json")
    hist = load(hist_path, {"items": {}})
    sent = load(sent_path, {})
    alerts, ok, failed = [], 0, 0
    for item in watch.get("items", []):
        name = item.get("name")
        if not name:
            continue
        try:
            data = fetch(item.get("q") or name, postal)
        except Exception as e:
            print(f"fetch failed for {name}: {e}"); failed += 1; continue
        ok += 1
        best, per_store = best_for(item, data, stores, now)
        key = norm_text(name)
        rec = hist["items"].setdefault(key, {"name": name, "weeks": {}})
        rec["name"] = name
        if not best:
            print(f"{name}: no price"); continue
        prev_weeks = {w: v for w, v in rec["weeks"].items() if w < wk}
        entry = {"p": best["p"], "per": best["per"], "store": best["store"], "product": best["name"][:80], "source": best["source"], "stores": per_store}
        cur = rec["weeks"].get(wk)
        if not cur or best["p"] <= cur["p"] or cur.get("store") == best["store"]:
            rec["weeks"][wk] = entry
        for w in sorted(rec["weeks"])[:-KEEP_WEEKS]:
            del rec["weeks"][w]
        print(f"{name}: {best['p']:.2f}{'/lb' if best['per'] else ''} at {best['store']} ({best['name'][:50]})")
        rule = item.get("alert") or {}
        why = None
        if rule.get("match") and not re.search(rule["match"], best["name"], re.I):
            rule = {}  # e.g. only alert for Lactantia, not other brands
        if rule.get("below") and best["p"] <= float(rule["below"]) and best["source"] == "flyer":
            why = f"under your {float(rule['below']):.2f} target"
        elif rule.get("newLow") and best["source"] == "flyer":
            recent = [v["p"] for w, v in sorted(prev_weeks.items())[-low_weeks:]]
            if len(recent) >= 3 and best["p"] < min(recent) - 0.004:
                why = f"lowest in {len(recent) + 1} weeks (was {min(recent):.2f})"
        if why:
            tag = f"{key}|{wk}|{best['p']:.2f}"
            if not sent.get(tag):
                alerts.append((name, best, why, tag))
    if topic and alerts:
        lines = [f"{n}: ${b['p']:.2f}{'/lb' if b['per'] else ''} at {NAMES.get(b['store'], b['store'])} - {why}" for n, b, why, _ in alerts]
        title = f"{len(alerts)} grocery deal{'s' if len(alerts) > 1 else ''}" if len(alerts) > 1 else f"Deal: {alerts[0][0]}"
        if notify(topic, title, "\n".join(lines)):
            for *_, tag in alerts:
                sent[tag] = now.isoformat()
    # forget alert records older than ~10 weeks
    cutoff = (now - timedelta(weeks=10)).isoformat()
    sent = {k: v for k, v in sent.items() if v >= cutoff}
    hist["updated"] = now.isoformat()
    hist["postal"] = postal
    os.makedirs(os.path.dirname(hist_path), exist_ok=True)
    with open(hist_path, "w") as f:
        json.dump(hist, f, indent=1, sort_keys=True)
    with open(sent_path, "w") as f:
        json.dump(sent, f, indent=1, sort_keys=True)
    print(f"checked {ok} items, {failed} failed, {len(alerts)} alerts")
    return 1 if ok == 0 and failed else 0


if __name__ == "__main__":
    sys.exit(main())
