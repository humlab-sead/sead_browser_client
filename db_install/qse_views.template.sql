SET search_path TO public;

-- View: <schema>.qse_abundance_identification_levels

-- DROP VIEW <schema>.qse_abundance_identification_levels;

CREATE OR REPLACE VIEW <schema>.qse_abundance_identification_levels
 AS
 SELECT abundance_ident_levels.abundance_id,
    abundance_ident_levels.identification_level_id,
    abundances.taxon_id,
    identification_levels.identification_level_name
   FROM <schema>.abundance_ident_levels
     JOIN <schema>.abundances ON abundance_ident_levels.abundance_id = abundances.abundance_id
     JOIN <schema>.identification_levels ON abundance_ident_levels.identification_level_id = identification_levels.identification_level_id;

ALTER TABLE <schema>.qse_abundance_identification_levels
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_abundance_identification_levels TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_abundance_identification_levels TO <grantread>;


-- View: <schema>.qse_abundance_modification

-- DROP VIEW <schema>.qse_abundance_modification;

CREATE OR REPLACE VIEW <schema>.qse_abundance_modification
 AS
 SELECT abundance_modifications.modification_type_id,
    abundance_modifications.abundance_id,
    modification_types.modification_type_name,
    modification_types.modification_type_description
   FROM <schema>.abundance_modifications
     LEFT JOIN <schema>.modification_types ON modification_types.modification_type_id = abundance_modifications.modification_type_id;

ALTER TABLE <schema>.qse_abundance_modification
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_abundance_modification TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_abundance_modification TO <grantread>;


-- View: <schema>.qse_analysis

-- DROP VIEW <schema>.qse_analysis;

CREATE OR REPLACE VIEW <schema>.qse_analysis
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
   FROM <schema>.datasets
     LEFT JOIN <schema>.methods ON datasets.method_id = methods.method_id
     LEFT JOIN <schema>.record_types ON methods.record_type_id = record_types.record_type_id
     LEFT JOIN <schema>.data_types ON datasets.data_type_id = data_types.data_type_id;

ALTER TABLE <schema>.qse_analysis
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_analysis TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_analysis TO <grantread>;


-- View: <schema>.qse_analysis_methods

-- DROP VIEW <schema>.qse_analysis_methods;

CREATE OR REPLACE VIEW <schema>.qse_analysis_methods
 AS
 SELECT sample_groups.site_id,
    sample_groups.sample_group_id,
    methods.method_id,
    methods.method_name,
    methods.method_abbrev_or_alt_name
   FROM <schema>.sample_groups
     LEFT JOIN <schema>.physical_samples ON sample_groups.sample_group_id = physical_samples.sample_group_id
     LEFT JOIN <schema>.analysis_entities ON physical_samples.physical_sample_id = analysis_entities.physical_sample_id
     LEFT JOIN <schema>.datasets ON analysis_entities.dataset_id = datasets.dataset_id
     LEFT JOIN <schema>.methods ON datasets.method_id = methods.method_id;

ALTER TABLE <schema>.qse_analysis_methods
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_analysis_methods TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_analysis_methods TO <grantread>;


-- View: <schema>.qse_dataset

-- DROP VIEW <schema>.qse_dataset;

CREATE OR REPLACE VIEW <schema>.qse_dataset
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
   FROM <schema>.analysis_entities
     LEFT JOIN <schema>.measured_values ON analysis_entities.analysis_entity_id = measured_values.analysis_entity_id
     LEFT JOIN <schema>.physical_samples ON analysis_entities.physical_sample_id = physical_samples.physical_sample_id
     LEFT JOIN <schema>.abundances ON analysis_entities.analysis_entity_id = abundances.analysis_entity_id
     LEFT JOIN <schema>.abundance_elements ON abundances.abundance_element_id = abundance_elements.abundance_element_id;

ALTER TABLE <schema>.qse_dataset
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_dataset TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_dataset TO <grantread>;


-- View: <schema>.qse_feature_types

-- DROP VIEW <schema>.qse_feature_types;

CREATE OR REPLACE VIEW <schema>.qse_feature_types
 AS
 SELECT sample_groups.site_id,
    sample_groups.sample_group_id,
    feature_types.feature_type_id,
    feature_types.feature_type_name,
    feature_types.feature_type_description
   FROM <schema>.sample_groups
     LEFT JOIN <schema>.physical_samples ON sample_groups.sample_group_id = physical_samples.sample_group_id
     LEFT JOIN <schema>.physical_sample_features ON physical_samples.physical_sample_id = physical_sample_features.physical_sample_id
     JOIN <schema>.feature_types ON physical_sample_features.feature_id = feature_types.feature_type_id;

ALTER TABLE <schema>.qse_feature_types
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_feature_types TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_feature_types TO <grantread>;


-- View: <schema>.qse_methods

-- DROP VIEW <schema>.qse_methods;

CREATE OR REPLACE VIEW <schema>.qse_methods
 AS
 SELECT sample_groups.sample_group_id,
    sample_groups.site_id,
    sample_groups.sampling_context_id,
    sample_groups.method_id,
    methods.method_name,
    methods.method_abbrev_or_alt_name
   FROM <schema>.sample_groups
     LEFT JOIN <schema>.methods ON sample_groups.method_id = methods.method_id;

ALTER TABLE <schema>.qse_methods
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_methods TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_methods TO <grantread>;


-- View: <schema>.qse_sample

-- DROP VIEW <schema>.qse_sample;

CREATE OR REPLACE VIEW <schema>.qse_sample
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
   FROM <schema>.physical_samples
     LEFT JOIN <schema>.sample_types ON physical_samples.sample_type_id = sample_types.sample_type_id;

ALTER TABLE <schema>.qse_sample
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_sample TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_sample TO <grantread>;


-- View: <schema>.qse_sample_dimensions

-- DROP VIEW <schema>.qse_sample_dimensions;

CREATE OR REPLACE VIEW <schema>.qse_sample_dimensions
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
   FROM <schema>.sample_dimensions
     LEFT JOIN <schema>.dimensions ON sample_dimensions.dimension_id = dimensions.dimension_id
     LEFT JOIN <schema>.methods ON sample_dimensions.method_id = methods.method_id
     LEFT JOIN <schema>.method_groups ON dimensions.method_group_id = method_groups.method_group_id
     LEFT JOIN <schema>.units ON dimensions.unit_id = units.unit_id;

ALTER TABLE <schema>.qse_sample_dimensions
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_sample_dimensions TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_sample_dimensions TO <grantread>;


-- View: <schema>.qse_sample_group

-- DROP VIEW <schema>.qse_sample_group;

CREATE OR REPLACE VIEW <schema>.qse_sample_group
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
   FROM <schema>.sample_groups
     LEFT JOIN <schema>.methods ON sample_groups.method_id = methods.method_id
     LEFT JOIN <schema>.sample_group_description_type_sampling_contexts ON sample_groups.sampling_context_id = sample_group_description_type_sampling_contexts.sampling_context_id
     LEFT JOIN <schema>.sample_group_description_types ON sample_group_description_type_sampling_contexts.sample_group_description_type_id = sample_group_description_types.sample_group_description_type_id;

ALTER TABLE <schema>.qse_sample_group
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_sample_group TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_sample_group TO <grantread>;


-- View: postgrest_api.qse_sample_group_biblio

-- DROP VIEW postgrest_api.qse_sample_group_biblio;

CREATE OR REPLACE VIEW postgrest_api.qse_sample_group_biblio
 AS
 SELECT sample_group_references.biblio_id,
    sample_group_references.sample_group_reference_id,
    biblio.authors AS biblio_author,
    biblio.bugs_reference AS biblio_bugs_reference,
    biblio.doi AS biblio_doi,
    biblio.isbn AS biblio_isbn,
    biblio.notes AS biblio_notes,
    biblio.title AS biblio_title,
    biblio.year AS biblio_year,
    biblio.full_reference as biblio_full_reference,
    biblio.url as biblio_url,
    sample_group_references.sample_group_id
   FROM postgrest_api.sample_group_references
     LEFT JOIN postgrest_api.biblio ON sample_group_references.biblio_id = biblio.biblio_id;

ALTER TABLE postgrest_api.qse_sample_group_biblio
    OWNER TO <viewowner>;

GRANT ALL ON TABLE postgrest_api.qse_sample_group_biblio TO <viewowner>;
GRANT SELECT ON TABLE postgrest_api.qse_sample_group_biblio TO <grantread>;

-- View: <schema>.qse_sample_types

-- DROP VIEW <schema>.qse_sample_types;

CREATE OR REPLACE VIEW <schema>.qse_sample_types
 AS
 SELECT tbl_sample_types.sample_type_id,
    tbl_sample_types.type_name,
    tbl_sample_types.description
   FROM tbl_sample_types;

ALTER TABLE <schema>.qse_sample_types
    OWNER TO <viewowner>;

GRANT SELECT ON TABLE <schema>.qse_sample_types TO <grantread>;
GRANT ALL ON TABLE <schema>.qse_sample_types TO <viewowner>;


-- View: <schema>.qse_site

-- DROP VIEW <schema>.qse_site;

CREATE OR REPLACE VIEW <schema>.qse_site
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
   FROM <schema>.sites
     LEFT JOIN <schema>.site_other_records ON sites.site_id = site_other_records.site_id
     LEFT JOIN <schema>.record_types ON site_other_records.record_type_id = record_types.record_type_id;

ALTER TABLE <schema>.qse_site
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_site TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_site TO <grantread>;


-- View: <schema>.qse_site_analyses

-- DROP VIEW <schema>.qse_site_analyses;

CREATE OR REPLACE VIEW <schema>.qse_site_analyses
 AS
 SELECT DISTINCT methods.method_id,
    methods.method_group_id,
    sites.site_id,
    sample_groups.sample_group_id,
    datasets.dataset_id
   FROM <schema>.sites
     LEFT JOIN <schema>.sample_groups ON sites.site_id = sample_groups.site_id
     LEFT JOIN <schema>.physical_samples ON sample_groups.sample_group_id = physical_samples.sample_group_id
     LEFT JOIN <schema>.analysis_entities ON physical_samples.physical_sample_id = analysis_entities.physical_sample_id
     LEFT JOIN <schema>.datasets ON analysis_entities.dataset_id = datasets.dataset_id
     LEFT JOIN <schema>.methods ON datasets.method_id = methods.method_id
  WHERE methods.method_id >= 0;

ALTER TABLE <schema>.qse_site_analyses
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_site_analyses TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_site_analyses TO <grantread>;


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
    OWNER TO <viewowner>;

GRANT ALL ON TABLE postgrest_api.qse_site_biblio TO <viewowner>;
GRANT SELECT ON TABLE postgrest_api.qse_site_biblio TO <grantread>;

-- View: <schema>.qse_site_locations

-- DROP VIEW <schema>.qse_site_locations;

CREATE OR REPLACE VIEW <schema>.qse_site_locations
 AS
 SELECT site_locations.site_id,
    site_locations.site_location_id,
    site_locations.location_id,
    locations.location_name,
    locations.location_type_id,
    location_types.location_type,
    location_types.description
   FROM <schema>.site_locations
     LEFT JOIN <schema>.locations ON site_locations.location_id = locations.location_id
     LEFT JOIN <schema>.location_types ON locations.location_type_id = location_types.location_type_id
  ORDER BY locations.location_type_id DESC;

ALTER TABLE <schema>.qse_site_locations
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_site_locations TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_site_locations TO <grantread>;


-- View: <schema>.qse_taxa

-- DROP VIEW <schema>.qse_taxa;

CREATE OR REPLACE VIEW <schema>.qse_taxa
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
   FROM <schema>.taxa_tree_master
     LEFT JOIN <schema>.taxa_common_names ON taxa_tree_master.taxon_id = taxa_common_names.taxon_id
     LEFT JOIN <schema>.taxa_tree_genera ON taxa_tree_master.genus_id = taxa_tree_genera.genus_id
     LEFT JOIN <schema>.taxa_tree_families ON taxa_tree_genera.family_id = taxa_tree_families.family_id;

ALTER TABLE <schema>.qse_taxa
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_taxa TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_taxa TO <grantread>;


-- View: <schema>.qse_taxon

-- DROP VIEW <schema>.qse_taxon;

CREATE OR REPLACE VIEW <schema>.qse_taxon
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
   FROM <schema>.taxa_tree_master
     LEFT JOIN <schema>.taxa_common_names ON taxa_tree_master.taxon_id = taxa_common_names.taxon_id
     LEFT JOIN <schema>.taxa_tree_genera ON taxa_tree_master.genus_id = taxa_tree_genera.genus_id
     LEFT JOIN <schema>.taxa_tree_families ON taxa_tree_genera.family_id = taxa_tree_families.family_id
     LEFT JOIN <schema>.taxa_tree_authors ON taxa_tree_master.author_id = taxa_tree_authors.author_id;

ALTER TABLE <schema>.qse_taxon
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_taxon TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_taxon TO <grantread>;



-- View: <schema>.qse_sample_group_analyses

-- DROP VIEW <schema>.qse_sample_group_analyses;

CREATE OR REPLACE VIEW <schema>.qse_sample_group_analyses
 AS
 SELECT DISTINCT qse_analysis_methods.method_id,
    sample_groups.sample_group_id,
    sample_groups.site_id,
    qse_analysis_methods.method_name,
    qse_analysis_methods.method_abbrev_or_alt_name
   FROM <schema>.sample_groups
     LEFT JOIN <schema>.methods ON sample_groups.method_id = methods.method_id
     LEFT JOIN <schema>.sample_group_description_type_sampling_contexts ON sample_groups.sampling_context_id = sample_group_description_type_sampling_contexts.sampling_context_id
     LEFT JOIN <schema>.sample_group_description_types ON sample_group_description_type_sampling_contexts.sample_group_description_type_id = sample_group_description_types.sample_group_description_type_id
     LEFT JOIN <schema>.qse_analysis_methods ON sample_groups.sample_group_id = qse_analysis_methods.sample_group_id
  WHERE qse_analysis_methods.method_id IS NOT NULL;

ALTER TABLE <schema>.qse_sample_group_analyses
    OWNER TO <viewowner>;

GRANT ALL ON TABLE <schema>.qse_sample_group_analyses TO <viewowner>;
GRANT SELECT ON TABLE <schema>.qse_sample_group_analyses TO <grantread>;

