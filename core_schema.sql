--
-- PostgreSQL database dump
--

\restrict LFlzigNepJgtnL2N7wIeP60MZpJmI9NGPwVCjJLI8461SzsDjdEtcZqKtHj5mwV

-- Dumped from database version 18.1 (Postgres.app)
-- Dumped by pg_dump version 18.1 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA core;


ALTER SCHEMA core OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.audit_logs OWNER TO shubhkanchan;

--
-- Name: clients; Type: TABLE; Schema: core; Owner: postgres
--

CREATE TABLE core.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.clients OWNER TO postgres;

--
-- Name: commission_rules; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    level integer NOT NULL,
    percentage numeric(5,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.commission_rules OWNER TO shubhkanchan;

--
-- Name: commissions; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    level integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.commissions OWNER TO shubhkanchan;

--
-- Name: order_items; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE core.order_items OWNER TO shubhkanchan;

--
-- Name: orders; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    idempotency_key text
);


ALTER TABLE core.orders OWNER TO shubhkanchan;

--
-- Name: products; Type: TABLE; Schema: core; Owner: postgres
--

CREATE TABLE core.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.products OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: core; Owner: postgres
--

CREATE TABLE core.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    sponsor_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.users OWNER TO postgres;

--
-- Name: wallets; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    balance numeric(12,2) DEFAULT 0.00 NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.wallets OWNER TO shubhkanchan;

--
-- Name: withdrawal_requests; Type: TABLE; Schema: core; Owner: shubhkanchan
--

CREATE TABLE core.withdrawal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    idempotency_key text
);


ALTER TABLE core.withdrawal_requests OWNER TO shubhkanchan;

--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_client_id_level_key; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commission_rules
    ADD CONSTRAINT commission_rules_client_id_level_key UNIQUE (client_id, level);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: users users_client_id_email_key; Type: CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_client_id_email_key UNIQUE (client_id, email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_client_id_user_id_key; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.wallets
    ADD CONSTRAINT wallets_client_id_user_id_key UNIQUE (client_id, user_id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_client_created_idx; Type: INDEX; Schema: core; Owner: shubhkanchan
--

CREATE INDEX audit_logs_client_created_idx ON core.audit_logs USING btree (client_id, created_at DESC);


--
-- Name: idx_commissions_client_status; Type: INDEX; Schema: core; Owner: shubhkanchan
--

CREATE INDEX idx_commissions_client_status ON core.commissions USING btree (client_id, status);


--
-- Name: orders_client_idempotency_key_uniq; Type: INDEX; Schema: core; Owner: shubhkanchan
--

CREATE UNIQUE INDEX orders_client_idempotency_key_uniq ON core.orders USING btree (client_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: withdrawal_client_idempotency_key_uniq; Type: INDEX; Schema: core; Owner: shubhkanchan
--

CREATE UNIQUE INDEX withdrawal_client_idempotency_key_uniq ON core.withdrawal_requests USING btree (client_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: commission_rules commission_rules_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commission_rules
    ADD CONSTRAINT commission_rules_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: commissions commissions_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commissions
    ADD CONSTRAINT commissions_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: commissions commissions_order_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commissions
    ADD CONSTRAINT commissions_order_id_fkey FOREIGN KEY (order_id) REFERENCES core.orders(id);


--
-- Name: commissions commissions_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.commissions
    ADD CONSTRAINT commissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES core.orders(id);


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES core.products(id);


--
-- Name: orders orders_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: products products_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.products
    ADD CONSTRAINT products_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: users users_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: users users_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: postgres
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_sponsor_id_fkey FOREIGN KEY (sponsor_id) REFERENCES core.users(id);


--
-- Name: wallets wallets_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.wallets
    ADD CONSTRAINT wallets_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: withdrawal_requests withdrawal_requests_client_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES core.clients(id);


--
-- Name: withdrawal_requests withdrawal_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: shubhkanchan
--

ALTER TABLE ONLY core.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: SCHEMA core; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA core TO mlm_backend;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT SELECT,INSERT ON TABLE core.audit_logs TO mlm_backend;


--
-- Name: TABLE clients; Type: ACL; Schema: core; Owner: postgres
--

GRANT ALL ON TABLE core.clients TO shubhkanchan;
GRANT ALL ON TABLE core.clients TO mlm_backend;


--
-- Name: TABLE commission_rules; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.commission_rules TO mlm_backend;


--
-- Name: TABLE commissions; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT ALL ON TABLE core.commissions TO mlm_backend;


--
-- Name: TABLE order_items; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT ALL ON TABLE core.order_items TO mlm_backend;


--
-- Name: TABLE orders; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT ALL ON TABLE core.orders TO mlm_backend;


--
-- Name: TABLE products; Type: ACL; Schema: core; Owner: postgres
--

GRANT ALL ON TABLE core.products TO shubhkanchan;
GRANT ALL ON TABLE core.products TO mlm_backend;


--
-- Name: TABLE users; Type: ACL; Schema: core; Owner: postgres
--

GRANT ALL ON TABLE core.users TO shubhkanchan;
GRANT ALL ON TABLE core.users TO mlm_backend;


--
-- Name: TABLE wallets; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT ALL ON TABLE core.wallets TO mlm_backend;


--
-- Name: TABLE withdrawal_requests; Type: ACL; Schema: core; Owner: shubhkanchan
--

GRANT ALL ON TABLE core.withdrawal_requests TO mlm_backend;


--
-- PostgreSQL database dump complete
--

\unrestrict LFlzigNepJgtnL2N7wIeP60MZpJmI9NGPwVCjJLI8461SzsDjdEtcZqKtHj5mwV

