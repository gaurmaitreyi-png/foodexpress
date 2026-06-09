# FoodExpress

A food delivery web app I built as a full-stack exercise. You can browse restaurants, build an order, and place it. The point of the project was to go through the whole pipeline once myself: Django models and the request/response cycle on the backend, a typed React SPA on the frontend, and an actual deployment instead of just running it locally.

Live site: https://project-u640j.vercel.app

Backend API: https://foodexpress-api-6cuf.onrender.com

## Stack

Backend is Django 6 with Django REST Framework and SimpleJWT for tokens. Database is PostgreSQL on Render (SQLite when running locally). Frontend is React 18 with TypeScript, built with Vite. Framer Motion for the page transitions, react-hot-toast for the small notifications, lucide-react for icons. Backend is hosted on Render and the frontend on Vercel.

## Why PostgreSQL instead of MongoDB

The original spec said MongoDB but I switched after starting. Django's ORM is built around relational tables, and the libraries that bridge it to MongoDB (`djongo`, `mongoengine`) don't keep up with new Django releases. A food delivery schema is also naturally relational, so I wasn't really gaining anything by forcing Mongo in there. Render's free Postgres covered it.

## Models

Five models, with a custom user. I set up `AbstractUser` at the start because adding a custom user model later in a Django project is genuinely painful.

- `User`: has the usual auth fields plus a phone and address, and an `is_restaurant_owner` flag in case I add an owner dashboard later.
- `Restaurant`: belongs to a user, with cuisine, rating, delivery time.
- `MenuItem`: belongs to a restaurant.
- `Order`: belongs to a customer and a restaurant. Has a status field with six states (PENDING, CONFIRMED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED).
- `OrderItem`: line item on an order. The important detail here is that it stores `unit_price` directly instead of always reading it from the menu item. That way if the restaurant changes their prices tomorrow, my order from yesterday still shows what I actually paid.

![Home page](docs/screenshots/home.png)

The two model methods worth pointing out:

`OrderItem.save()` overrides the default save to capture the menu price the first time the item is saved, so the snapshot above happens automatically.

`Order.recalculate_total()` sums up the line items and writes the total back with `update_fields=["total_price", "updated_at"]`. Using `update_fields` means only those two columns are touched in the SQL, which matters when other code might be writing to the same row.

The `on_delete` choices were deliberate. Restaurants and menu items use `CASCADE` on their parents, which is fine because if you delete a restaurant you don't want orphaned menu rows. But `Order.restaurant` uses `PROTECT` instead. If someone deletes a restaurant out from under an order that's still being delivered, that's a real problem, so the database refuses the delete.

## API

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| POST | /api/auth/register/ | no | create a user |
| POST | /api/auth/login/ | no | returns JWT access + refresh |
| POST | /api/auth/refresh/ | no | refresh the access token |
| GET | /api/restaurants/ | no | list restaurants |
| GET | /api/restaurants/{id}/ | no | restaurant with nested menu items |
| GET | /api/orders/ | yes | orders for the logged-in user only |
| POST | /api/orders/ | yes | place an order |
| POST | /api/orders/{id}/cancel/ | yes | cancel a non-delivered order |

The frontend routes correspond directly. The home page hits the list endpoint, `/restaurant/:id` hits the detail endpoint, the cart page POSTs to orders, and so on.

![Menu page](docs/screenshots/menu.png)

## Running it locally

Backend, from the `backend` folder:

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python seed.py
python manage.py runserver
```

Frontend, from `frontend`:

```
npm install
npm run dev
```

Frontend dev server is on `http://localhost:5173` and reads `VITE_API_URL` from `.env`, which defaults to the local Django at port 8000.

## Deployment

Backend on Render. The `render.yaml` in the backend folder provisions both the web service and a free Postgres database in one go, so it's a Blueprint deploy rather than a manual one. I had to set `rootDir: backend` in the YAML so Render runs the build script from inside that folder, and I added `python seed.py || true` at the end of `build.sh` so the demo restaurants get loaded on each deploy without needing shell access (the Render free tier doesn't open the shell unless you put a card on file).

Frontend on Vercel. Imported the repo, set the root directory to `frontend`, and added `VITE_API_URL` pointing at the Render URL plus `/api`. The `vercel.json` does the SPA rewrite so refreshing on `/restaurant/3` doesn't 404.

The thing that bit me: after both were live, the frontend still couldn't talk to the backend. The browser was blocking the requests because CORS on Django was only allowing `localhost:5173`. Updated `CORS_ALLOWED_ORIGINS` on Render to the Vercel URL and it worked.

## Notes on the code

- Auth tokens go into `localStorage`. Fine for a demo. If this were going past demo, I'd move to httpOnly cookies because localStorage is reachable from any script on the page.
- Cart only holds items from one restaurant at a time. Adding from a second restaurant clears the first cart, which is what most delivery apps do.
- Seed images come from Unsplash.
- I left `tests.py` empty. The end-to-end check I ran before deploying was a script that registered, logged in, ordered, and cancelled against the local server. If I were extending this, that goes into a proper test file with `pytest-django`.
