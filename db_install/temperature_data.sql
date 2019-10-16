-- Table: public.tbl_temperatures

-- DROP TABLE public.tbl_temperatures;

CREATE TABLE public.tbl_temperatures
(
    year_b2k integer NOT NULL,
    smoothed_temp_deviation numeric,
    record_id integer NOT NULL DEFAULT nextval('tbl_temperatures_record_id_seq'::regclass),
    avg_temp_deviation numeric,
    CONSTRAINT tbl_temperatures_pkey PRIMARY KEY (record_id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.tbl_temperatures
    OWNER to seadwrite;







-- View: postgrest_api.abundance_elements

-- DROP VIEW postgrest_api.abundance_elements;

CREATE OR REPLACE VIEW postgrest_api.temperatures
 AS
 SELECT tbl_temperatures.record_id,
    tbl_temperatures.year_b2k,
    tbl_temperatures.smoothed_temp_deviation,
    tbl_temperatures.avg_temp_deviation
   FROM tbl_temperatures;

ALTER TABLE postgrest_api.temperatures
    OWNER TO postgrest;

GRANT ALL ON TABLE postgrest_api.temperatures TO postgrest;
GRANT SELECT ON TABLE postgrest_api.temperatures TO postgrest_anon;