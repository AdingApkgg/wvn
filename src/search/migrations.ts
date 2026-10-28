import type { Migration } from '../database/migrations.ts';

/** 必须在目录迁移之后安装；触发器与业务数据使用同一事务。 */
export const searchMigrations: Migration[] = [{ id: '004-search-postgres', sql: `
CREATE TABLE search_outbox(
 work_id text PRIMARY KEY,
 generation bigint NOT NULL DEFAULT 1,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token uuid,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_outbox_ready ON search_outbox(available_at,work_id);
CREATE FUNCTION search_enqueue(target text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF target IS NOT NULL THEN
  INSERT INTO search_outbox(work_id) VALUES(target)
  ON CONFLICT(work_id) DO UPDATE SET generation=search_outbox.generation+1,
   available_at=LEAST(search_outbox.available_at,now()),updated_at=now();
 END IF;
END $$;
CREATE FUNCTION search_catalog_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_work text; next_work text;
BEGIN
 IF TG_TABLE_NAME='works' THEN
  IF TG_OP<>'INSERT' THEN previous_work=OLD.id; END IF;
  IF TG_OP<>'DELETE' THEN next_work=NEW.id; END IF;
 ELSIF TG_TABLE_NAME='reports' THEN
  IF TG_OP<>'INSERT' THEN SELECT work_id INTO previous_work FROM versions WHERE id=OLD.version_id; END IF;
  IF TG_OP<>'DELETE' THEN SELECT work_id INTO next_work FROM versions WHERE id=NEW.version_id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN previous_work=OLD.work_id; END IF;
  IF TG_OP<>'DELETE' THEN next_work=NEW.work_id; END IF;
 END IF;
 PERFORM search_enqueue(previous_work);
 IF next_work IS DISTINCT FROM previous_work THEN PERFORM search_enqueue(next_work); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER search_works AFTER INSERT OR UPDATE OR DELETE ON works FOR EACH ROW EXECUTE FUNCTION search_catalog_changed();
CREATE TRIGGER search_versions AFTER INSERT OR UPDATE OR DELETE ON versions FOR EACH ROW EXECUTE FUNCTION search_catalog_changed();
CREATE TRIGGER search_metadata AFTER INSERT OR UPDATE OR DELETE ON work_metadata FOR EACH ROW EXECUTE FUNCTION search_catalog_changed();
CREATE TRIGGER search_reports AFTER INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION search_catalog_changed();
INSERT INTO search_outbox(work_id) SELECT id FROM works;
` }];
