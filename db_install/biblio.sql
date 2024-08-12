-- View: postgrest_api.qse_sample_group_biblio

-- DROP VIEW postgrest_api.qse_sample_group_biblio;

CREATE OR REPLACE VIEW postgrest_api.qse_sample_group_biblio
 AS
 SELECT sample_group_references.biblio_id,
    sample_group_references.sample_group_id,
    biblio.authors AS biblio_author,
    biblio.bugs_reference AS biblio_bugs_reference,
    biblio.doi AS biblio_doi,
    biblio.isbn AS biblio_isbn,
    biblio.notes AS biblio_notes,
    biblio.title AS biblio_title,
    biblio.year AS biblio_year,
    biblio.full_reference as biblio_full_reference,
    biblio.url as biblio_url
   FROM postgrest_api.sample_group_references
     LEFT JOIN postgrest_api.biblio ON sample_group_references.biblio_id = biblio.biblio_id;

ALTER TABLE postgrest_api.qse_sample_group_biblio
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_sample_group_biblio TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_sample_group_biblio TO sead_read;




-- View: postgrest_api.qse_site_biblio

-- DROP VIEW postgrest_api.qse_site_biblio;

CREATE OR REPLACE VIEW postgrest_api.qse_site_biblio
 AS
 SELECT site_references.site_reference_id,
    site_references.site_id,
    site_references.biblio_id,
    site_references.date_updated,
    biblio.authors,
    biblio.date_updated AS biblio_date_updated,
    biblio.doi,
    biblio.isbn,
    biblio.notes,
    biblio.title,
    biblio.year
   FROM postgrest_api.site_references
     LEFT JOIN postgrest_api.biblio ON site_references.biblio_id = biblio.biblio_id;

ALTER TABLE postgrest_api.qse_site_biblio
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_site_biblio TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_site_biblio TO sead_read;
