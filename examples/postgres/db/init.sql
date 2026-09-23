-- Order desk schema: a stand-in for "the database you already have".
-- Runs once, as the owner role, when the container is first created.

CREATE TABLE tenants (
  id          text PRIMARY KEY,               -- e.g. 'ten_acme'
  slug        text NOT NULL UNIQUE,           -- what an operator types at login
  name        text NOT NULL,
  time_zone   text NOT NULL                   -- IANA zone; date phrases are read in it
);

CREATE TABLE customers (
  id          text PRIMARY KEY,               -- opaque public id, e.g. 'cus_3f9a0c1b'
  tenant_id   text NOT NULL REFERENCES tenants(id),
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  company     text,                           -- NULL for consumer buyers
  email       text NOT NULL,
  city        text NOT NULL,
  country_code char(2) NOT NULL,
  created_at  timestamptz NOT NULL
);
CREATE INDEX customers_tenant_name ON customers (tenant_id, lower(first_name), lower(last_name));

CREATE TABLE products (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL REFERENCES tenants(id),
  sku         text NOT NULL,
  name        text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE orders (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        text NOT NULL REFERENCES tenants(id),
  order_number     text NOT NULL,
  customer_id      text NOT NULL REFERENCES customers(id),
  status           text NOT NULL CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded')),
  payment_status   text NOT NULL CHECK (payment_status IN ('paid','unpaid','refunded','partially_refunded')),
  channel          text NOT NULL CHECK (channel IN ('web','mobile','marketplace','phone')),
  -- NULL until a shipping method is chosen (some pending and cancelled orders never get one).
  shipping_method  text CHECK (shipping_method IN ('standard','express','overnight')),
  country_code     char(2) NOT NULL,
  country_name     text NOT NULL,
  currency         char(3) NOT NULL DEFAULT 'USD',
  total_cents      integer NOT NULL CHECK (total_cents >= 0),
  is_gift          boolean NOT NULL DEFAULT false,
  is_b2b           boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL,
  UNIQUE (tenant_id, order_number)
);
CREATE INDEX orders_tenant_created ON orders (tenant_id, created_at DESC);
CREATE INDEX orders_tenant_customer ON orders (tenant_id, customer_id);

CREATE TABLE order_items (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       text NOT NULL REFERENCES products(id),
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0)
);
CREATE INDEX order_items_order ON order_items (order_id);

-- The app connects as this role. It can read and nothing else.
-- Local development password only.
CREATE ROLE orderdesk_reader LOGIN PASSWORD 'reader_dev_only';
ALTER ROLE orderdesk_reader SET default_transaction_read_only = on;
ALTER ROLE orderdesk_reader SET statement_timeout = '5s';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE orderdesk TO orderdesk_reader;
GRANT USAGE ON SCHEMA public TO orderdesk_reader;
GRANT SELECT ON tenants, customers, products, orders, order_items TO orderdesk_reader;
