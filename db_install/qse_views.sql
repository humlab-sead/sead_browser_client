-- View: postgrest_api.qse_abundance_identification_levels

-- DROP VIEW postgrest_api.qse_abundance_identification_levels;

CREATE OR REPLACE VIEW postgrest_api.qse_abundance_identification_levels
 AS
 SELECT abundance_ident_levels.abundance_id,
    abundance_ident_levels.identification_level_id,
    abundances.taxon_id,
    identification_levels.identification_level_name
   FROM postgrest_api.abundance_ident_levels
     JOIN postgrest_api.abundances ON abundance_ident_levels.abundance_id = abundances.abundance_id
     JOIN postgrest_api.identification_levels ON abundance_ident_levels.identification_level_id = identification_levels.identification_level_id;

ALTER TABLE postgrest_api.qse_abundance_identification_levels
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_abundance_identification_levels TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_abundance_identification_levels TO sead_read;


-- View: postgrest_api.qse_abundance_modification

-- DROP VIEW postgrest_api.qse_abundance_modification;

CREATE OR REPLACE VIEW postgrest_api.qse_abundance_modification
 AS
 SELECT abundance_modifications.modification_type_id,
    abundance_modifications.abundance_id,
    modification_types.modification_type_name,
    modification_types.modification_type_description
   FROM postgrest_api.abundance_modifications
     LEFT JOIN postgrest_api.modification_types ON modification_types.modification_type_id = abundance_modifications.modification_type_id;

ALTER TABLE postgrest_api.qse_abundance_modification
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_abundance_modification TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_abundance_modification TO sead_read;


-- View: postgrest_api.qse_analysis

-- DROP VIEW postgrest_api.qse_analysis;

CREATE OR REPLACE VIEW postgrest_api.qse_analysis
 AS
 SELECT datasets.dataset_id,
    datasets.method_id,
    datasets.master_set_id,
    datasets.dataset_name,
    datasets.data_type_id,
    methods.description,
    methods.method_abbrev_or_alt_name,
    methods.method_group_id,
    methods.method_name,
    methods.record_type_id,
    methods.unit_id,
    record_types.record_type_name,
    record_types.record_type_description,
    data_types.data_type_group_id,
    data_types.data_type_name,
    data_types.definition
   FROM postgrest_api.datasets
     LEFT JOIN postgrest_api.methods ON datasets.method_id = methods.method_id
     LEFT JOIN postgrest_api.record_types ON methods.record_type_id = record_types.record_type_id
     LEFT JOIN postgrest_api.data_types ON datasets.data_type_id = data_types.data_type_id;

ALTER TABLE postgrest_api.qse_analysis
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_analysis TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_analysis TO sead_read;


-- View: postgrest_api.qse_analysis_methods

-- DROP VIEW postgrest_api.qse_analysis_methods;

CREATE OR REPLACE VIEW postgrest_api.qse_analysis_methods
 AS
 SELECT sample_groups.site_id,
    sample_groups.sample_group_id,
    methods.method_id,
    methods.method_name,
    methods.method_abbrev_or_alt_name
   FROM postgrest_api.sample_groups
     LEFT JOIN postgrest_api.physical_samples ON sample_groups.sample_group_id = physical_samples.sample_group_id
     LEFT JOIN postgrest_api.analysis_entities ON physical_samples.physical_sample_id = analysis_entities.physical_sample_id
     LEFT JOIN postgrest_api.datasets ON analysis_entities.dataset_id = datasets.dataset_id
     LEFT JOIN postgrest_api.methods ON datasets.method_id = methods.method_id;

ALTER TABLE postgrest_api.qse_analysis_methods
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_analysis_methods TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_analysis_methods TO sead_read;


-- View: postgrest_api.qse_dataset

-- DROP VIEW postgrest_api.qse_dataset;

CREATE OR REPLACE VIEW postgrest_api.qse_dataset
 AS
 SELECT analysis_entities.dataset_id,
    analysis_entities.analysis_entity_id,
    analysis_entities.physical_sample_id,
    measured_values.measured_value,
    abundances.abundance_id,
    abundances.taxon_id AS abundance_taxon_id,
    abundances.abundance,
    physical_samples.sample_group_id,
    physical_samples.alt_ref_type_id AS sample_alt_ref_type_id,
    physical_samples.sample_type_id,
    physical_samples.sample_name,
    abundance_elements.element_name,
    abundance_elements.element_description
   FROM postgrest_api.analysis_entities
     LEFT JOIN postgrest_api.measured_values ON analysis_entities.analysis_entity_id = measured_values.analysis_entity_id
     LEFT JOIN postgrest_api.physical_samples ON analysis_entities.physical_sample_id = physical_samples.physical_sample_id
     LEFT JOIN postgrest_api.abundances ON analysis_entities.analysis_entity_id = abundances.analysis_entity_id
     LEFT JOIN postgrest_api.abundance_elements ON abundances.abundance_element_id = abundance_elements.abundance_element_id;

ALTER TABLE postgrest_api.qse_dataset
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_dataset TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_dataset TO sead_read;


-- View: postgrest_api.qse_feature_types

-- DROP VIEW postgrest_api.qse_feature_types;

CREATE OR REPLACE VIEW postgrest_api.qse_feature_types
 AS
 SELECT sample_groups.site_id,
    sample_groups.sample_group_id,
    feature_types.feature_type_id,
    feature_types.feature_type_name,
    feature_types.feature_type_description
   FROM postgrest_api.sample_groups
     LEFT JOIN postgrest_api.physical_samples ON sample_groups.sample_group_id = physical_samples.sample_group_id
     LEFT JOIN postgrest_api.physical_sample_features ON physical_samples.physical_sample_id = physical_sample_features.physical_sample_id
     JOIN postgrest_api.feature_types ON physical_sample_features.feature_id = feature_types.feature_type_id;

ALTER TABLE postgrest_api.qse_feature_types
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_feature_types TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_feature_types TO sead_read;


-- View: postgrest_api.qse_methods

-- DROP VIEW postgrest_api.qse_methods;

CREATE OR REPLACE VIEW postgrest_api.qse_methods
 AS
 SELECT sample_groups.sample_group_id,
    sample_groups.site_id,
    sample_groups.sampling_context_id,
    sample_groups.method_id,
    methods.method_name,
    methods.method_abbrev_or_alt_name
   FROM postgrest_api.sample_groups
     LEFT JOIN postgrest_api.methods ON sample_groups.method_id = methods.method_id;

ALTER TABLE postgrest_api.qse_methods
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_methods TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_methods TO sead_read;


-- View: postgrest_api.qse_sample

-- DROP VIEW postgrest_api.qse_sample;

CREATE OR REPLACE VIEW postgrest_api.qse_sample
 AS
 SELECT physical_samples.physical_sample_id,
    physical_samples.sample_group_id,
    physical_samples.alt_ref_type_id,
    physical_samples.sample_type_id,
    physical_samples.sample_name,
    physical_samples.date_updated,
    physical_samples.date_sampled,
    sample_types.type_name AS sample_type_name,
    sample_types.description AS sample_type_description
   FROM postgrest_api.physical_samples
     LEFT JOIN postgrest_api.sample_types ON physical_samples.sample_type_id = sample_types.sample_type_id;

ALTER TABLE postgrest_api.qse_sample
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_sample TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_sample TO sead_read;


-- View: postgrest_api.qse_sample_dimensions

-- DROP VIEW postgrest_api.qse_sample_dimensions;

CREATE OR REPLACE VIEW postgrest_api.qse_sample_dimensions
 AS
 SELECT sample_dimensions.sample_dimension_id,
    sample_dimensions.physical_sample_id,
    sample_dimensions.dimension_id,
    sample_dimensions.method_id,
    sample_dimensions.dimension_value,
    methods.description AS method_description,
    methods.method_abbrev_or_alt_name,
    methods.method_group_id,
    methods.method_name,
    methods.record_type_id,
    methods.unit_id,
    dimensions.dimension_abbrev,
    dimensions.dimension_description,
    dimensions.dimension_name,
    dimensions.unit_id AS dimension_unit_id,
    dimensions.method_group_id AS dimension_method_group_id,
    method_groups.description AS method_group_description,
    method_groups.group_name AS method_group_name,
    units.description AS unit_description,
    units.unit_abbrev,
    units.unit_name
   FROM postgrest_api.sample_dimensions
     LEFT JOIN postgrest_api.dimensions ON sample_dimensions.dimension_id = dimensions.dimension_id
     LEFT JOIN postgrest_api.methods ON sample_dimensions.method_id = methods.method_id
     LEFT JOIN postgrest_api.method_groups ON dimensions.method_group_id = method_groups.method_group_id
     LEFT JOIN postgrest_api.units ON dimensions.unit_id = units.unit_id;

ALTER TABLE postgrest_api.qse_sample_dimensions
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_sample_dimensions TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_sample_dimensions TO sead_read;


-- View: postgrest_api.qse_sample_group

-- DROP VIEW postgrest_api.qse_sample_group;

CREATE OR REPLACE VIEW postgrest_api.qse_sample_group
 AS
 SELECT sample_groups.sample_group_id,
    sample_groups.site_id,
    sample_groups.sampling_context_id,
    sample_groups.method_id,
    sample_groups.sample_group_name,
    sample_groups.sample_group_description,
    sample_groups.date_updated,
    methods.method_name,
    methods.description AS method_description,
    methods.method_abbrev_or_alt_name,
    sample_group_description_types.type_name AS sample_group_description_type_name,
    sample_group_description_types.type_description AS sample_group_description_type_description
   FROM postgrest_api.sample_groups
     LEFT JOIN postgrest_api.methods ON sample_groups.method_id = methods.method_id
     LEFT JOIN postgrest_api.sample_group_description_type_sampling_contexts ON sample_groups.sampling_context_id = sample_group_description_type_sampling_contexts.sampling_context_id
     LEFT JOIN postgrest_api.sample_group_description_types ON sample_group_description_type_sampling_contexts.sample_group_description_type_id = sample_group_description_types.sample_group_description_type_id;

ALTER TABLE postgrest_api.qse_sample_group
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_sample_group TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_sample_group TO sead_read;


-- View: postgrest_api.qse_sample_group_biblio

-- DROP VIEW postgrest_api.qse_sample_group_biblio;
/*
CREATE OR REPLACE VIEW postgrest_api.qse_sample_group_biblio
 AS
 SELECT sample_group_reference.biblio_id,
    sample_group_reference.sample_group_id,
    biblio.author AS biblio_author,
    biblio.biblio_keyword_id,
    biblio.bugs_author AS biblio_bugs_author,
    biblio.bugs_biblio_id,
    biblio.bugs_reference AS biblio_bugs_reference,
    biblio.bugs_title AS biblio_bugs_title,
    biblio.collection_or_journal_id,
    biblio.doi AS biblio_doi,
    biblio.edition AS biblio_edition,
    biblio.isbn AS biblio_isbn,
    biblio.keywords AS biblio_keywords,
    biblio.notes AS biblio_notes,
    biblio.number AS biblio_number,
    biblio.pages AS biblio_pages,
    biblio.pdf_link AS biblio_pdf_link,
    biblio.publication_type_id,
    biblio.publisher_id,
    biblio.title AS biblio_title,
    biblio.volume AS biblio_volume,
    biblio.year AS biblio_year,
    collections_or_journal.collection_or_journal_abbrev,
    collections_or_journal.collection_title_or_journal_name,
    collections_or_journal.issn AS coj_issn,
    collections_or_journal.number_of_volumes AS coj_number_of_volumes,
    collections_or_journal.publisher_id AS coj_publisher_id,
    collections_or_journal.series_editor AS coj_series_editor,
    collections_or_journal.series_title AS coj_series_title,
    collections_or_journal.volume_editor AS coj_volume_editor,
    publication_type.publication_type,
    publisher.place_of_publishing_house,
    publisher.publisher_name
   FROM postgrest_api.sample_group_reference
     LEFT JOIN postgrest_api.biblio ON sample_group_reference.biblio_id = biblio.biblio_id
     LEFT JOIN postgrest_api.collections_or_journal ON biblio.collection_or_journal_id = collections_or_journal.collection_or_journal_id
     LEFT JOIN postgrest_api.publication_type ON biblio.publication_type_id = publication_type.publication_type_id
     LEFT JOIN postgrest_api.publisher ON biblio.publisher_id = publisher.publisher_id;

ALTER TABLE postgrest_api.qse_sample_group_biblio
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_sample_group_biblio TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_sample_group_biblio TO sead_read;
*/

-- View: postgrest_api.qse_sample_types

-- DROP VIEW postgrest_api.qse_sample_types;

CREATE OR REPLACE VIEW postgrest_api.qse_sample_types
 AS
 SELECT tbl_sample_types.sample_type_id,
    tbl_sample_types.type_name,
    tbl_sample_types.description
   FROM tbl_sample_types;

ALTER TABLE postgrest_api.qse_sample_types
    OWNER TO sead_master;

GRANT SELECT ON TABLE postgrest_api.qse_sample_types TO sead_read;
GRANT ALL ON TABLE postgrest_api.qse_sample_types TO sead_master;


-- View: postgrest_api.qse_site

-- DROP VIEW postgrest_api.qse_site;

CREATE OR REPLACE VIEW postgrest_api.qse_site
 AS
 SELECT sites.site_id,
    sites.altitude,
    sites.latitude_dd,
    sites.longitude_dd,
    sites.national_site_identifier,
    sites.site_description,
    sites.site_name,
    sites.site_preservation_status_id,
    sites.date_updated,
    record_types.record_type_id,
    record_types.record_type_name,
    record_types.record_type_description
   FROM postgrest_api.sites
     LEFT JOIN postgrest_api.site_other_records ON sites.site_id = site_other_records.site_id
     LEFT JOIN postgrest_api.record_types ON site_other_records.record_type_id = record_types.record_type_id;

ALTER TABLE postgrest_api.qse_site
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_site TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_site TO sead_read;


-- View: postgrest_api.qse_site_analyses

-- DROP VIEW postgrest_api.qse_site_analyses;

CREATE OR REPLACE VIEW postgrest_api.qse_site_analyses
 AS
 SELECT DISTINCT methods.method_id,
    methods.method_group_id,
    sites.site_id,
    sample_groups.sample_group_id,
    datasets.dataset_id
   FROM postgrest_api.sites
     LEFT JOIN postgrest_api.sample_groups ON sites.site_id = sample_groups.site_id
     LEFT JOIN postgrest_api.physical_samples ON sample_groups.sample_group_id = physical_samples.sample_group_id
     LEFT JOIN postgrest_api.analysis_entities ON physical_samples.physical_sample_id = analysis_entities.physical_sample_id
     LEFT JOIN postgrest_api.datasets ON analysis_entities.dataset_id = datasets.dataset_id
     LEFT JOIN postgrest_api.methods ON datasets.method_id = methods.method_id
  WHERE methods.method_id >= 0;

ALTER TABLE postgrest_api.qse_site_analyses
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_site_analyses TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_site_analyses TO sead_read;


-- View: postgrest_api.qse_site_biblio

-- DROP VIEW postgrest_api.qse_site_biblio;
/*
CREATE OR REPLACE VIEW postgrest_api.qse_site_biblio
 AS
 SELECT site_reference.site_reference_id,
    site_reference.site_id,
    site_reference.biblio_id,
    site_reference.date_updated,
    biblio.author,
    biblio.biblio_keyword_id,
    biblio.bugs_author,
    biblio.bugs_biblio_id,
    biblio.bugs_reference,
    biblio.bugs_title,
    biblio.collection_or_journal_id,
    biblio.date_updated AS biblio_date_updated,
    biblio.doi,
    biblio.edition,
    biblio.isbn,
    biblio.keywords,
    biblio.notes,
    biblio.number,
    biblio.pages,
    biblio.pdf_link,
    biblio.publication_type_id,
    biblio.publisher_id,
    biblio.title,
    biblio.volume,
    biblio.year,
    publisher.publisher_name,
    publisher.place_of_publishing_house,
    collections_or_journal.collection_or_journal_abbrev,
    collections_or_journal.collection_title_or_journal_name,
    collections_or_journal.issn AS collection_issn,
    collections_or_journal.number_of_volumes AS collection_number_of_volumes,
    collections_or_journal.series_editor AS collection_series_editor,
    collections_or_journal.series_title AS collection_series_title,
    collections_or_journal.volume_editor AS collection_volume_editor,
    publication_type.publication_type
   FROM postgrest_api.site_reference
     LEFT JOIN postgrest_api.biblio ON site_reference.biblio_id = biblio.biblio_id
     LEFT JOIN postgrest_api.publication_type ON biblio.publication_type_id = publication_type.publication_type_id
     LEFT JOIN postgrest_api.publisher ON biblio.publisher_id = publisher.publisher_id
     LEFT JOIN postgrest_api.collections_or_journal ON biblio.collection_or_journal_id = collections_or_journal.collection_or_journal_id;

ALTER TABLE postgrest_api.qse_site_biblio
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_site_biblio TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_site_biblio TO sead_read;
*/

-- View: postgrest_api.qse_site_locations

-- DROP VIEW postgrest_api.qse_site_locations;

CREATE OR REPLACE VIEW postgrest_api.qse_site_locations
 AS
 SELECT site_locations.site_id,
    site_locations.site_location_id,
    site_locations.location_id,
    locations.location_name,
    locations.location_type_id,
    location_types.location_type,
    location_types.description
   FROM postgrest_api.site_locations
     LEFT JOIN postgrest_api.locations ON site_locations.location_id = locations.location_id
     LEFT JOIN postgrest_api.location_types ON locations.location_type_id = location_types.location_type_id
  ORDER BY locations.location_type_id DESC;

ALTER TABLE postgrest_api.qse_site_locations
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_site_locations TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_site_locations TO sead_read;


-- View: postgrest_api.qse_taxa

-- DROP VIEW postgrest_api.qse_taxa;

CREATE OR REPLACE VIEW postgrest_api.qse_taxa
 AS
 SELECT taxa_tree_master.taxon_id,
    taxa_tree_master.author_id,
    taxa_tree_master.genus_id,
    taxa_tree_master.species,
    taxa_common_names.taxon_common_name_id,
    taxa_common_names.common_name,
    taxa_common_names.language_id AS common_name_language_id,
    taxa_tree_genera.family_id,
    taxa_tree_genera.genus_name,
    taxa_tree_families.family_name,
    taxa_tree_families.order_id AS family_order_id
   FROM postgrest_api.taxa_tree_master
     LEFT JOIN postgrest_api.taxa_common_names ON taxa_tree_master.taxon_id = taxa_common_names.taxon_id
     LEFT JOIN postgrest_api.taxa_tree_genera ON taxa_tree_master.genus_id = taxa_tree_genera.genus_id
     LEFT JOIN postgrest_api.taxa_tree_families ON taxa_tree_genera.family_id = taxa_tree_families.family_id;

ALTER TABLE postgrest_api.qse_taxa
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_taxa TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_taxa TO sead_read;


-- View: postgrest_api.qse_taxon

-- DROP VIEW postgrest_api.qse_taxon;

CREATE OR REPLACE VIEW postgrest_api.qse_taxon
 AS
 SELECT taxa_tree_master.taxon_id,
    taxa_tree_master.author_id,
    taxa_tree_authors.author_name,
    taxa_tree_master.genus_id,
    taxa_tree_master.species,
    taxa_common_names.taxon_common_name_id,
    taxa_common_names.common_name,
    taxa_common_names.language_id AS common_name_language_id,
    taxa_tree_genera.family_id,
    taxa_tree_genera.genus_name,
    taxa_tree_families.family_name,
    taxa_tree_families.order_id AS family_order_id
   FROM postgrest_api.taxa_tree_master
     LEFT JOIN postgrest_api.taxa_common_names ON taxa_tree_master.taxon_id = taxa_common_names.taxon_id
     LEFT JOIN postgrest_api.taxa_tree_genera ON taxa_tree_master.genus_id = taxa_tree_genera.genus_id
     LEFT JOIN postgrest_api.taxa_tree_families ON taxa_tree_genera.family_id = taxa_tree_families.family_id
     LEFT JOIN postgrest_api.taxa_tree_authors ON taxa_tree_master.author_id = taxa_tree_authors.author_id;

ALTER TABLE postgrest_api.qse_taxon
    OWNER TO sead_master;

GRANT ALL ON TABLE postgrest_api.qse_taxon TO sead_master;
GRANT SELECT ON TABLE postgrest_api.qse_taxon TO sead_read;

