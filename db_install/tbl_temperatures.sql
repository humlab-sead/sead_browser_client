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