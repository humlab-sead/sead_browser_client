CREATE SCHEMA IF NOT EXISTS postgrest_api;
GRANT USAGE ON SCHEMA postgrest_api TO sead_master;
GRANT USAGE ON SCHEMA postgrest_api TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.measured_values AS SELECT tbl_measured_values."measured_value_id", tbl_measured_values."analysis_entity_id", tbl_measured_values."date_updated", tbl_measured_values."measured_value" FROM tbl_measured_values;
ALTER TABLE postgrest_api.measured_values OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.measured_values TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.aggregate_datasets AS SELECT tbl_aggregate_datasets."aggregate_dataset_id", tbl_aggregate_datasets."aggregate_order_type_id", tbl_aggregate_datasets."biblio_id", tbl_aggregate_datasets."aggregate_dataset_name", tbl_aggregate_datasets."date_updated", tbl_aggregate_datasets."description" FROM tbl_aggregate_datasets;
ALTER TABLE postgrest_api.aggregate_datasets OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.aggregate_datasets TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.activity_types AS SELECT tbl_activity_types."activity_type_id", tbl_activity_types."activity_type", tbl_activity_types."description", tbl_activity_types."date_updated" FROM tbl_activity_types;
ALTER TABLE postgrest_api.activity_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.activity_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ceramics_measurements AS SELECT tbl_ceramics_measurements."ceramics_measurement_id", tbl_ceramics_measurements."date_updated", tbl_ceramics_measurements."method_id" FROM tbl_ceramics_measurements;
ALTER TABLE postgrest_api.ceramics_measurements OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ceramics_measurements TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.chron_control_types AS SELECT tbl_chron_control_types."chron_control_type_id", tbl_chron_control_types."chron_control_type", tbl_chron_control_types."date_updated" FROM tbl_chron_control_types;
ALTER TABLE postgrest_api.chron_control_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.chron_control_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.methods AS SELECT tbl_methods."method_id", tbl_methods."biblio_id", tbl_methods."date_updated", tbl_methods."description", tbl_methods."method_abbrev_or_alt_name", tbl_methods."method_group_id", tbl_methods."method_name", tbl_methods."record_type_id", tbl_methods."unit_id" FROM tbl_methods;
ALTER TABLE postgrest_api.methods OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.methods TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dating_uncertainty AS SELECT tbl_dating_uncertainty."dating_uncertainty_id", tbl_dating_uncertainty."date_updated", tbl_dating_uncertainty."description", tbl_dating_uncertainty."uncertainty" FROM tbl_dating_uncertainty;
ALTER TABLE postgrest_api.dating_uncertainty OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dating_uncertainty TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dendro AS SELECT tbl_dendro."dendro_id", tbl_dendro."analysis_entity_id", tbl_dendro."measurement_value", tbl_dendro."date_updated", tbl_dendro."dendro_lookup_id" FROM tbl_dendro;
ALTER TABLE postgrest_api.dendro OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dendro TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.feature_types AS SELECT tbl_feature_types."feature_type_id", tbl_feature_types."feature_type_name", tbl_feature_types."feature_type_description", tbl_feature_types."date_updated" FROM tbl_feature_types;
ALTER TABLE postgrest_api.feature_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.feature_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.locations AS SELECT tbl_locations."location_id", tbl_locations."location_name", tbl_locations."location_type_id", tbl_locations."default_lat_dd", tbl_locations."default_long_dd", tbl_locations."date_updated" FROM tbl_locations;
ALTER TABLE postgrest_api.locations OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.locations TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.physical_sample_features AS SELECT tbl_physical_sample_features."physical_sample_feature_id", tbl_physical_sample_features."date_updated", tbl_physical_sample_features."feature_id", tbl_physical_sample_features."physical_sample_id" FROM tbl_physical_sample_features;
ALTER TABLE postgrest_api.physical_sample_features OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.physical_sample_features TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.project_types AS SELECT tbl_project_types."project_type_id", tbl_project_types."project_type_name", tbl_project_types."description", tbl_project_types."date_updated" FROM tbl_project_types;
ALTER TABLE postgrest_api.project_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.project_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_descriptions AS SELECT tbl_sample_group_descriptions."sample_group_description_id", tbl_sample_group_descriptions."group_description", tbl_sample_group_descriptions."sample_group_description_type_id", tbl_sample_group_descriptions."date_updated", tbl_sample_group_descriptions."sample_group_id" FROM tbl_sample_group_descriptions;
ALTER TABLE postgrest_api.sample_group_descriptions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_descriptions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_notes AS SELECT tbl_sample_notes."sample_note_id", tbl_sample_notes."physical_sample_id", tbl_sample_notes."note_type", tbl_sample_notes."note", tbl_sample_notes."date_updated" FROM tbl_sample_notes;
ALTER TABLE postgrest_api.sample_notes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_notes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_description_types AS SELECT tbl_sample_group_description_types."sample_group_description_type_id", tbl_sample_group_description_types."type_name", tbl_sample_group_description_types."type_description", tbl_sample_group_description_types."date_updated" FROM tbl_sample_group_description_types;
ALTER TABLE postgrest_api.sample_group_description_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_description_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_types AS SELECT tbl_sample_types."sample_type_id", tbl_sample_types."type_name", tbl_sample_types."description", tbl_sample_types."date_updated" FROM tbl_sample_types;
ALTER TABLE postgrest_api.sample_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_groups AS SELECT tbl_sample_groups."sample_group_id", tbl_sample_groups."site_id", tbl_sample_groups."sampling_context_id", tbl_sample_groups."method_id", tbl_sample_groups."sample_group_name", tbl_sample_groups."sample_group_description", tbl_sample_groups."date_updated" FROM tbl_sample_groups;
ALTER TABLE postgrest_api.sample_groups OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_groups TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.aggregate_sample_ages AS SELECT tbl_aggregate_sample_ages."aggregate_sample_age_id", tbl_aggregate_sample_ages."aggregate_dataset_id", tbl_aggregate_sample_ages."analysis_entity_age_id", tbl_aggregate_sample_ages."date_updated" FROM tbl_aggregate_sample_ages;
ALTER TABLE postgrest_api.aggregate_sample_ages OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.aggregate_sample_ages TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.aggregate_order_types AS SELECT tbl_aggregate_order_types."aggregate_order_type_id", tbl_aggregate_order_types."aggregate_order_type", tbl_aggregate_order_types."date_updated", tbl_aggregate_order_types."description" FROM tbl_aggregate_order_types;
ALTER TABLE postgrest_api.aggregate_order_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.aggregate_order_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.identification_levels AS SELECT tbl_identification_levels."identification_level_id", tbl_identification_levels."identification_level_abbrev", tbl_identification_levels."identification_level_name", tbl_identification_levels."notes", tbl_identification_levels."date_updated" FROM tbl_identification_levels;
ALTER TABLE postgrest_api.identification_levels OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.identification_levels TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.contacts AS SELECT tbl_contacts."contact_id", tbl_contacts."address_1", tbl_contacts."address_2", tbl_contacts."location_id", tbl_contacts."email", tbl_contacts."first_name", tbl_contacts."last_name", tbl_contacts."phone_number", tbl_contacts."url", tbl_contacts."date_updated" FROM tbl_contacts;
ALTER TABLE postgrest_api.contacts OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.contacts TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.contact_types AS SELECT tbl_contact_types."contact_type_id", tbl_contact_types."contact_type_name", tbl_contact_types."date_updated", tbl_contact_types."description" FROM tbl_contact_types;
ALTER TABLE postgrest_api.contact_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.contact_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dataset_submissions AS SELECT tbl_dataset_submissions."dataset_submission_id", tbl_dataset_submissions."dataset_id", tbl_dataset_submissions."submission_type_id", tbl_dataset_submissions."contact_id", tbl_dataset_submissions."date_submitted", tbl_dataset_submissions."notes", tbl_dataset_submissions."date_updated" FROM tbl_dataset_submissions;
ALTER TABLE postgrest_api.dataset_submissions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dataset_submissions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dataset_submission_types AS SELECT tbl_dataset_submission_types."submission_type_id", tbl_dataset_submission_types."submission_type", tbl_dataset_submission_types."description", tbl_dataset_submission_types."date_updated" FROM tbl_dataset_submission_types;
ALTER TABLE postgrest_api.dataset_submission_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dataset_submission_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.data_type_groups AS SELECT tbl_data_type_groups."data_type_group_id", tbl_data_type_groups."data_type_group_name", tbl_data_type_groups."date_updated", tbl_data_type_groups."description" FROM tbl_data_type_groups;
ALTER TABLE postgrest_api.data_type_groups OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.data_type_groups TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.imported_taxa_replacements AS SELECT tbl_imported_taxa_replacements."imported_taxa_replacement_id", tbl_imported_taxa_replacements."date_updated", tbl_imported_taxa_replacements."imported_name_replaced", tbl_imported_taxa_replacements."taxon_id" FROM tbl_imported_taxa_replacements;
ALTER TABLE postgrest_api.imported_taxa_replacements OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.imported_taxa_replacements TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dating_labs AS SELECT tbl_dating_labs."dating_lab_id", tbl_dating_labs."contact_id", tbl_dating_labs."international_lab_id", tbl_dating_labs."lab_name", tbl_dating_labs."country_id", tbl_dating_labs."date_updated" FROM tbl_dating_labs;
ALTER TABLE postgrest_api.dating_labs OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dating_labs TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.languages AS SELECT tbl_languages."language_id", tbl_languages."date_updated", tbl_languages."language_name_english", tbl_languages."language_name_native" FROM tbl_languages;
ALTER TABLE postgrest_api.languages OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.languages TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.location_types AS SELECT tbl_location_types."location_type_id", tbl_location_types."date_updated", tbl_location_types."description", tbl_location_types."location_type" FROM tbl_location_types;
ALTER TABLE postgrest_api.location_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.location_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.mcr_names AS SELECT tbl_mcr_names."taxon_id", tbl_mcr_names."comparison_notes", tbl_mcr_names."date_updated", tbl_mcr_names."mcr_name_trim", tbl_mcr_names."mcr_number", tbl_mcr_names."mcr_species_name" FROM tbl_mcr_names;
ALTER TABLE postgrest_api.mcr_names OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.mcr_names TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.mcr_summary_data AS SELECT tbl_mcr_summary_data."mcr_summary_data_id", tbl_mcr_summary_data."cog_mid_tmax", tbl_mcr_summary_data."cog_mid_trange", tbl_mcr_summary_data."date_updated", tbl_mcr_summary_data."taxon_id", tbl_mcr_summary_data."tmax_hi", tbl_mcr_summary_data."tmax_lo", tbl_mcr_summary_data."tmin_hi", tbl_mcr_summary_data."tmin_lo", tbl_mcr_summary_data."trange_hi", tbl_mcr_summary_data."trange_lo" FROM tbl_mcr_summary_data;
ALTER TABLE postgrest_api.mcr_summary_data OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.mcr_summary_data TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.mcrdata_birmbeetledat AS SELECT tbl_mcrdata_birmbeetledat."mcrdata_birmbeetledat_id", tbl_mcrdata_birmbeetledat."date_updated", tbl_mcrdata_birmbeetledat."mcr_data", tbl_mcrdata_birmbeetledat."mcr_row", tbl_mcrdata_birmbeetledat."taxon_id" FROM tbl_mcrdata_birmbeetledat;
ALTER TABLE postgrest_api.mcrdata_birmbeetledat OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.mcrdata_birmbeetledat TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ecocodes AS SELECT tbl_ecocodes."ecocode_id", tbl_ecocodes."date_updated", tbl_ecocodes."ecocode_definition_id", tbl_ecocodes."taxon_id" FROM tbl_ecocodes;
ALTER TABLE postgrest_api.ecocodes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ecocodes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_references AS SELECT tbl_sample_group_references."sample_group_reference_id", tbl_sample_group_references."biblio_id", tbl_sample_group_references."date_updated", tbl_sample_group_references."sample_group_id" FROM tbl_sample_group_references;
ALTER TABLE postgrest_api.sample_group_references OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_references TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_notes AS SELECT tbl_sample_group_notes."sample_group_note_id", tbl_sample_group_notes."sample_group_id", tbl_sample_group_notes."note", tbl_sample_group_notes."date_updated" FROM tbl_sample_group_notes;
ALTER TABLE postgrest_api.sample_group_notes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_notes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dendro_dates AS SELECT tbl_dendro_dates."dendro_date_id", tbl_dendro_dates."analysis_entity_id", tbl_dendro_dates."age_older", tbl_dendro_dates."age_younger", tbl_dendro_dates."dating_uncertainty_id", tbl_dendro_dates."season_or_qualifier_id", tbl_dendro_dates."date_updated", tbl_dendro_dates."error_plus", tbl_dendro_dates."error_minus", tbl_dendro_dates."dendro_lookup_id", tbl_dendro_dates."error_uncertainty_id", tbl_dendro_dates."age_type_id" FROM tbl_dendro_dates;
ALTER TABLE postgrest_api.dendro_dates OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dendro_dates TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_sampling_contexts AS SELECT tbl_sample_group_sampling_contexts."sampling_context_id", tbl_sample_group_sampling_contexts."sampling_context", tbl_sample_group_sampling_contexts."description", tbl_sample_group_sampling_contexts."sort_order", tbl_sample_group_sampling_contexts."date_updated" FROM tbl_sample_group_sampling_contexts;
ALTER TABLE postgrest_api.sample_group_sampling_contexts OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_sampling_contexts TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.biblio AS SELECT tbl_biblio."biblio_id", tbl_biblio."bugs_reference", tbl_biblio."date_updated", tbl_biblio."doi", tbl_biblio."isbn", tbl_biblio."notes", tbl_biblio."title", tbl_biblio."year", tbl_biblio."authors", tbl_biblio."full_reference", tbl_biblio."url" FROM tbl_biblio;
ALTER TABLE postgrest_api.biblio OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.biblio TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dendro_lookup AS SELECT tbl_dendro_lookup."dendro_lookup_id", tbl_dendro_lookup."method_id", tbl_dendro_lookup."name", tbl_dendro_lookup."description", tbl_dendro_lookup."date_updated" FROM tbl_dendro_lookup;
ALTER TABLE postgrest_api.dendro_lookup OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dendro_lookup TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dating_material AS SELECT tbl_dating_material."dating_material_id", tbl_dating_material."geochron_id", tbl_dating_material."taxon_id", tbl_dating_material."material_dated", tbl_dating_material."description", tbl_dating_material."abundance_element_id", tbl_dating_material."date_updated" FROM tbl_dating_material;
ALTER TABLE postgrest_api.dating_material OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dating_material TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.abundance_ident_levels AS SELECT tbl_abundance_ident_levels."abundance_ident_level_id", tbl_abundance_ident_levels."abundance_id", tbl_abundance_ident_levels."identification_level_id", tbl_abundance_ident_levels."date_updated" FROM tbl_abundance_ident_levels;
ALTER TABLE postgrest_api.abundance_ident_levels OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.abundance_ident_levels TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ecocode_groups AS SELECT tbl_ecocode_groups."ecocode_group_id", tbl_ecocode_groups."date_updated", tbl_ecocode_groups."definition", tbl_ecocode_groups."ecocode_system_id", tbl_ecocode_groups."name", tbl_ecocode_groups."abbreviation" FROM tbl_ecocode_groups;
ALTER TABLE postgrest_api.ecocode_groups OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ecocode_groups TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.analysis_entity_prep_methods AS SELECT tbl_analysis_entity_prep_methods."analysis_entity_prep_method_id", tbl_analysis_entity_prep_methods."analysis_entity_id", tbl_analysis_entity_prep_methods."method_id", tbl_analysis_entity_prep_methods."date_updated" FROM tbl_analysis_entity_prep_methods;
ALTER TABLE postgrest_api.analysis_entity_prep_methods OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.analysis_entity_prep_methods TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_tree_authors AS SELECT tbl_taxa_tree_authors."author_id", tbl_taxa_tree_authors."author_name", tbl_taxa_tree_authors."date_updated" FROM tbl_taxa_tree_authors;
ALTER TABLE postgrest_api.taxa_tree_authors OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_tree_authors TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.geochron_refs AS SELECT tbl_geochron_refs."geochron_ref_id", tbl_geochron_refs."geochron_id", tbl_geochron_refs."biblio_id", tbl_geochron_refs."date_updated" FROM tbl_geochron_refs;
ALTER TABLE postgrest_api.geochron_refs OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.geochron_refs TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.colours AS SELECT tbl_colours."colour_id", tbl_colours."colour_name", tbl_colours."date_updated", tbl_colours."method_id", tbl_colours."rgb" FROM tbl_colours;
ALTER TABLE postgrest_api.colours OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.colours TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.datasets AS SELECT tbl_datasets."dataset_id", tbl_datasets."master_set_id", tbl_datasets."data_type_id", tbl_datasets."method_id", tbl_datasets."biblio_id", tbl_datasets."updated_dataset_id", tbl_datasets."project_id", tbl_datasets."dataset_name", tbl_datasets."date_updated" FROM tbl_datasets;
ALTER TABLE postgrest_api.datasets OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.datasets TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dimensions AS SELECT tbl_dimensions."dimension_id", tbl_dimensions."date_updated", tbl_dimensions."dimension_abbrev", tbl_dimensions."dimension_description", tbl_dimensions."dimension_name", tbl_dimensions."unit_id", tbl_dimensions."method_group_id" FROM tbl_dimensions;
ALTER TABLE postgrest_api.dimensions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dimensions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ecocode_systems AS SELECT tbl_ecocode_systems."ecocode_system_id", tbl_ecocode_systems."biblio_id", tbl_ecocode_systems."date_updated", tbl_ecocode_systems."definition", tbl_ecocode_systems."name", tbl_ecocode_systems."notes" FROM tbl_ecocode_systems;
ALTER TABLE postgrest_api.ecocode_systems OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ecocode_systems TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dataset_contacts AS SELECT tbl_dataset_contacts."dataset_contact_id", tbl_dataset_contacts."contact_id", tbl_dataset_contacts."contact_type_id", tbl_dataset_contacts."dataset_id", tbl_dataset_contacts."date_updated" FROM tbl_dataset_contacts;
ALTER TABLE postgrest_api.dataset_contacts OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dataset_contacts TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dendro_measurements AS SELECT tbl_dendro_measurements."dendro_measurement_id", tbl_dendro_measurements."date_updated", tbl_dendro_measurements."method_id" FROM tbl_dendro_measurements;
ALTER TABLE postgrest_api.dendro_measurements OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dendro_measurements TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_description_type_sampling_contexts AS SELECT tbl_sample_group_description_type_sampling_contexts."sample_group_description_type_sampling_context_id", tbl_sample_group_description_type_sampling_contexts."sampling_context_id", tbl_sample_group_description_type_sampling_contexts."sample_group_description_type_id", tbl_sample_group_description_type_sampling_contexts."date_updated" FROM tbl_sample_group_description_type_sampling_contexts;
ALTER TABLE postgrest_api.sample_group_description_type_sampling_contexts OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_description_type_sampling_contexts TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_locations AS SELECT tbl_sample_locations."sample_location_id", tbl_sample_locations."sample_location_type_id", tbl_sample_locations."physical_sample_id", tbl_sample_locations."location", tbl_sample_locations."date_updated" FROM tbl_sample_locations;
ALTER TABLE postgrest_api.sample_locations OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_locations TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.tephra_refs AS SELECT tbl_tephra_refs."tephra_ref_id", tbl_tephra_refs."biblio_id", tbl_tephra_refs."date_updated", tbl_tephra_refs."tephra_id" FROM tbl_tephra_refs;
ALTER TABLE postgrest_api.tephra_refs OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.tephra_refs TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_seasonality AS SELECT tbl_taxa_seasonality."seasonality_id", tbl_taxa_seasonality."activity_type_id", tbl_taxa_seasonality."season_id", tbl_taxa_seasonality."taxon_id", tbl_taxa_seasonality."location_id", tbl_taxa_seasonality."date_updated" FROM tbl_taxa_seasonality;
ALTER TABLE postgrest_api.taxa_seasonality OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_seasonality TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxonomic_order AS SELECT tbl_taxonomic_order."taxonomic_order_id", tbl_taxonomic_order."date_updated", tbl_taxonomic_order."taxon_id", tbl_taxonomic_order."taxonomic_code", tbl_taxonomic_order."taxonomic_order_system_id" FROM tbl_taxonomic_order;
ALTER TABLE postgrest_api.taxonomic_order OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxonomic_order TO sead_read;

CREATE OR REPLACE VIEW postgrest_api._taxa_alphabetically AS SELECT view_taxa_alphabetically."order_id", view_taxa_alphabetically."order", view_taxa_alphabetically."family_id", view_taxa_alphabetically."family", view_taxa_alphabetically."genus_id", view_taxa_alphabetically."genus", view_taxa_alphabetically."taxon_id", view_taxa_alphabetically."species", view_taxa_alphabetically."author_id", view_taxa_alphabetically."author" FROM view_taxa_alphabetically;
ALTER TABLE postgrest_api._taxa_alphabetically OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api._taxa_alphabetically TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxonomic_order_systems AS SELECT tbl_taxonomic_order_systems."taxonomic_order_system_id", tbl_taxonomic_order_systems."date_updated", tbl_taxonomic_order_systems."system_description", tbl_taxonomic_order_systems."system_name" FROM tbl_taxonomic_order_systems;
ALTER TABLE postgrest_api.taxonomic_order_systems OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxonomic_order_systems TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_common_names AS SELECT tbl_taxa_common_names."taxon_common_name_id", tbl_taxa_common_names."common_name", tbl_taxa_common_names."date_updated", tbl_taxa_common_names."language_id", tbl_taxa_common_names."taxon_id" FROM tbl_taxa_common_names;
ALTER TABLE postgrest_api.taxa_common_names OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_common_names TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_tree_orders AS SELECT tbl_taxa_tree_orders."order_id", tbl_taxa_tree_orders."date_updated", tbl_taxa_tree_orders."order_name", tbl_taxa_tree_orders."record_type_id", tbl_taxa_tree_orders."sort_order" FROM tbl_taxa_tree_orders;
ALTER TABLE postgrest_api.taxa_tree_orders OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_tree_orders TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.rdb_codes AS SELECT tbl_rdb_codes."rdb_code_id", tbl_rdb_codes."date_updated", tbl_rdb_codes."rdb_category", tbl_rdb_codes."rdb_definition", tbl_rdb_codes."rdb_system_id" FROM tbl_rdb_codes;
ALTER TABLE postgrest_api.rdb_codes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.rdb_codes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_location_types AS SELECT tbl_sample_location_types."sample_location_type_id", tbl_sample_location_types."location_type", tbl_sample_location_types."location_type_description", tbl_sample_location_types."date_updated" FROM tbl_sample_location_types;
ALTER TABLE postgrest_api.sample_location_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_location_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.modification_types AS SELECT tbl_modification_types."modification_type_id", tbl_modification_types."modification_type_name", tbl_modification_types."modification_type_description", tbl_modification_types."date_updated" FROM tbl_modification_types;
ALTER TABLE postgrest_api.modification_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.modification_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_dimensions AS SELECT tbl_sample_dimensions."sample_dimension_id", tbl_sample_dimensions."physical_sample_id", tbl_sample_dimensions."dimension_id", tbl_sample_dimensions."method_id", tbl_sample_dimensions."dimension_value", tbl_sample_dimensions."date_updated" FROM tbl_sample_dimensions;
ALTER TABLE postgrest_api.sample_dimensions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_dimensions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.method_groups AS SELECT tbl_method_groups."method_group_id", tbl_method_groups."date_updated", tbl_method_groups."description", tbl_method_groups."group_name" FROM tbl_method_groups;
ALTER TABLE postgrest_api.method_groups OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.method_groups TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.project_stages AS SELECT tbl_project_stages."project_stage_id", tbl_project_stages."stage_name", tbl_project_stages."description", tbl_project_stages."date_updated" FROM tbl_project_stages;
ALTER TABLE postgrest_api.project_stages OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.project_stages TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_images AS SELECT tbl_sample_images."sample_image_id", tbl_sample_images."date_updated", tbl_sample_images."description", tbl_sample_images."image_location", tbl_sample_images."image_name", tbl_sample_images."image_type_id", tbl_sample_images."physical_sample_id" FROM tbl_sample_images;
ALTER TABLE postgrest_api.sample_images OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_images TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.relative_ages AS SELECT tbl_relative_ages."relative_age_id", tbl_relative_ages."relative_age_type_id", tbl_relative_ages."relative_age_name", tbl_relative_ages."description", tbl_relative_ages."c14_age_older", tbl_relative_ages."c14_age_younger", tbl_relative_ages."cal_age_older", tbl_relative_ages."cal_age_younger", tbl_relative_ages."notes", tbl_relative_ages."date_updated", tbl_relative_ages."location_id", tbl_relative_ages."abbreviation" FROM tbl_relative_ages;
ALTER TABLE postgrest_api.relative_ages OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.relative_ages TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.rdb_systems AS SELECT tbl_rdb_systems."rdb_system_id", tbl_rdb_systems."biblio_id", tbl_rdb_systems."location_id", tbl_rdb_systems."rdb_first_published", tbl_rdb_systems."rdb_system", tbl_rdb_systems."rdb_system_date", tbl_rdb_systems."rdb_version", tbl_rdb_systems."date_updated" FROM tbl_rdb_systems;
ALTER TABLE postgrest_api.rdb_systems OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.rdb_systems TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.projects AS SELECT tbl_projects."project_id", tbl_projects."project_type_id", tbl_projects."project_stage_id", tbl_projects."project_name", tbl_projects."project_abbrev_name", tbl_projects."description", tbl_projects."date_updated" FROM tbl_projects;
ALTER TABLE postgrest_api.projects OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.projects TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.tephras AS SELECT tbl_tephras."tephra_id", tbl_tephras."c14_age", tbl_tephras."c14_age_older", tbl_tephras."c14_age_younger", tbl_tephras."cal_age", tbl_tephras."cal_age_older", tbl_tephras."cal_age_younger", tbl_tephras."date_updated", tbl_tephras."notes", tbl_tephras."tephra_name" FROM tbl_tephras;
ALTER TABLE postgrest_api.tephras OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.tephras TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.tephra_dates AS SELECT tbl_tephra_dates."tephra_date_id", tbl_tephra_dates."analysis_entity_id", tbl_tephra_dates."date_updated", tbl_tephra_dates."notes", tbl_tephra_dates."tephra_id", tbl_tephra_dates."dating_uncertainty_id" FROM tbl_tephra_dates;
ALTER TABLE postgrest_api.tephra_dates OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.tephra_dates TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.abundance_elements AS SELECT tbl_abundance_elements."abundance_element_id", tbl_abundance_elements."record_type_id", tbl_abundance_elements."element_name", tbl_abundance_elements."element_description", tbl_abundance_elements."date_updated" FROM tbl_abundance_elements;
ALTER TABLE postgrest_api.abundance_elements OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.abundance_elements TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.coordinate_method_dimensions AS SELECT tbl_coordinate_method_dimensions."coordinate_method_dimension_id", tbl_coordinate_method_dimensions."dimension_id", tbl_coordinate_method_dimensions."method_id", tbl_coordinate_method_dimensions."limit_upper", tbl_coordinate_method_dimensions."limit_lower", tbl_coordinate_method_dimensions."date_updated" FROM tbl_coordinate_method_dimensions;
ALTER TABLE postgrest_api.coordinate_method_dimensions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.coordinate_method_dimensions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.measured_value_dimensions AS SELECT tbl_measured_value_dimensions."measured_value_dimension_id", tbl_measured_value_dimensions."date_updated", tbl_measured_value_dimensions."dimension_id", tbl_measured_value_dimensions."dimension_value", tbl_measured_value_dimensions."measured_value_id" FROM tbl_measured_value_dimensions;
ALTER TABLE postgrest_api.measured_value_dimensions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.measured_value_dimensions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dataset_masters AS SELECT tbl_dataset_masters."master_set_id", tbl_dataset_masters."contact_id", tbl_dataset_masters."biblio_id", tbl_dataset_masters."master_name", tbl_dataset_masters."master_notes", tbl_dataset_masters."url", tbl_dataset_masters."date_updated" FROM tbl_dataset_masters;
ALTER TABLE postgrest_api.dataset_masters OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dataset_masters TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ecocode_definitions AS SELECT tbl_ecocode_definitions."ecocode_definition_id", tbl_ecocode_definitions."abbreviation", tbl_ecocode_definitions."date_updated", tbl_ecocode_definitions."definition", tbl_ecocode_definitions."ecocode_group_id", tbl_ecocode_definitions."name", tbl_ecocode_definitions."notes", tbl_ecocode_definitions."sort_order" FROM tbl_ecocode_definitions;
ALTER TABLE postgrest_api.ecocode_definitions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ecocode_definitions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_coordinates AS SELECT tbl_sample_group_coordinates."sample_group_position_id", tbl_sample_group_coordinates."coordinate_method_dimension_id", tbl_sample_group_coordinates."sample_group_position", tbl_sample_group_coordinates."position_accuracy", tbl_sample_group_coordinates."sample_group_id", tbl_sample_group_coordinates."date_updated" FROM tbl_sample_group_coordinates;
ALTER TABLE postgrest_api.sample_group_coordinates OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_coordinates TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_description_types AS SELECT tbl_sample_description_types."sample_description_type_id", tbl_sample_description_types."type_name", tbl_sample_description_types."type_description", tbl_sample_description_types."date_updated" FROM tbl_sample_description_types;
ALTER TABLE postgrest_api.sample_description_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_description_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_images AS SELECT tbl_sample_group_images."sample_group_image_id", tbl_sample_group_images."date_updated", tbl_sample_group_images."description", tbl_sample_group_images."image_location", tbl_sample_group_images."image_name", tbl_sample_group_images."image_type_id", tbl_sample_group_images."sample_group_id" FROM tbl_sample_group_images;
ALTER TABLE postgrest_api.sample_group_images OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_images TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_horizons AS SELECT tbl_sample_horizons."sample_horizon_id", tbl_sample_horizons."date_updated", tbl_sample_horizons."horizon_id", tbl_sample_horizons."physical_sample_id" FROM tbl_sample_horizons;
ALTER TABLE postgrest_api.sample_horizons OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_horizons TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.site_other_records AS SELECT tbl_site_other_records."site_other_records_id", tbl_site_other_records."site_id", tbl_site_other_records."biblio_id", tbl_site_other_records."record_type_id", tbl_site_other_records."description", tbl_site_other_records."date_updated" FROM tbl_site_other_records;
ALTER TABLE postgrest_api.site_other_records OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.site_other_records TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.relative_dates AS SELECT tbl_relative_dates."relative_date_id", tbl_relative_dates."relative_age_id", tbl_relative_dates."method_id", tbl_relative_dates."notes", tbl_relative_dates."date_updated", tbl_relative_dates."dating_uncertainty_id", tbl_relative_dates."analysis_entity_id" FROM tbl_relative_dates;
ALTER TABLE postgrest_api.relative_dates OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.relative_dates TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.units AS SELECT tbl_units."unit_id", tbl_units."date_updated", tbl_units."description", tbl_units."unit_abbrev", tbl_units."unit_name" FROM tbl_units;
ALTER TABLE postgrest_api.units OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.units TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ceramics AS SELECT tbl_ceramics."ceramics_id", tbl_ceramics."analysis_entity_id", tbl_ceramics."measurement_value", tbl_ceramics."date_updated", tbl_ceramics."ceramics_lookup_id" FROM tbl_ceramics;
ALTER TABLE postgrest_api.ceramics OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ceramics TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.lithology AS SELECT tbl_lithology."lithology_id", tbl_lithology."date_updated", tbl_lithology."depth_bottom", tbl_lithology."depth_top", tbl_lithology."description", tbl_lithology."lower_boundary", tbl_lithology."sample_group_id" FROM tbl_lithology;
ALTER TABLE postgrest_api.lithology OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.lithology TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.relative_age_types AS SELECT tbl_relative_age_types."relative_age_type_id", tbl_relative_age_types."age_type", tbl_relative_age_types."description", tbl_relative_age_types."date_updated" FROM tbl_relative_age_types;
ALTER TABLE postgrest_api.relative_age_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.relative_age_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.analysis_entity_ages AS SELECT tbl_analysis_entity_ages."analysis_entity_age_id", tbl_analysis_entity_ages."age", tbl_analysis_entity_ages."age_older", tbl_analysis_entity_ages."age_younger", tbl_analysis_entity_ages."analysis_entity_id", tbl_analysis_entity_ages."chronology_id", tbl_analysis_entity_ages."date_updated" FROM tbl_analysis_entity_ages;
ALTER TABLE postgrest_api.analysis_entity_ages OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.analysis_entity_ages TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.physical_samples AS SELECT tbl_physical_samples."physical_sample_id", tbl_physical_samples."sample_group_id", tbl_physical_samples."alt_ref_type_id", tbl_physical_samples."sample_type_id", tbl_physical_samples."sample_name", tbl_physical_samples."date_updated", tbl_physical_samples."date_sampled" FROM tbl_physical_samples;
ALTER TABLE postgrest_api.physical_samples OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.physical_samples TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.analysis_entity_dimensions AS SELECT tbl_analysis_entity_dimensions."analysis_entity_dimension_id", tbl_analysis_entity_dimensions."analysis_entity_id", tbl_analysis_entity_dimensions."dimension_id", tbl_analysis_entity_dimensions."dimension_value", tbl_analysis_entity_dimensions."date_updated" FROM tbl_analysis_entity_dimensions;
ALTER TABLE postgrest_api.analysis_entity_dimensions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.analysis_entity_dimensions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.chron_controls AS SELECT tbl_chron_controls."chron_control_id", tbl_chron_controls."age", tbl_chron_controls."age_limit_older", tbl_chron_controls."age_limit_younger", tbl_chron_controls."chron_control_type_id", tbl_chron_controls."chronology_id", tbl_chron_controls."date_updated", tbl_chron_controls."depth_bottom", tbl_chron_controls."depth_top", tbl_chron_controls."notes" FROM tbl_chron_controls;
ALTER TABLE postgrest_api.chron_controls OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.chron_controls TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_alt_refs AS SELECT tbl_sample_alt_refs."sample_alt_ref_id", tbl_sample_alt_refs."alt_ref", tbl_sample_alt_refs."alt_ref_type_id", tbl_sample_alt_refs."date_updated", tbl_sample_alt_refs."physical_sample_id" FROM tbl_sample_alt_refs;
ALTER TABLE postgrest_api.sample_alt_refs OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_alt_refs TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.text_biology AS SELECT tbl_text_biology."biology_id", tbl_text_biology."biblio_id", tbl_text_biology."biology_text", tbl_text_biology."date_updated", tbl_text_biology."taxon_id" FROM tbl_text_biology;
ALTER TABLE postgrest_api.text_biology OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.text_biology TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_images AS SELECT tbl_taxa_images."taxa_images_id", tbl_taxa_images."image_name", tbl_taxa_images."description", tbl_taxa_images."image_location", tbl_taxa_images."image_type_id", tbl_taxa_images."taxon_id", tbl_taxa_images."date_updated" FROM tbl_taxa_images;
ALTER TABLE postgrest_api.taxa_images OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_images TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_reference_specimens AS SELECT tbl_taxa_reference_specimens."taxa_reference_specimen_id", tbl_taxa_reference_specimens."taxon_id", tbl_taxa_reference_specimens."contact_id", tbl_taxa_reference_specimens."notes", tbl_taxa_reference_specimens."date_updated" FROM tbl_taxa_reference_specimens;
ALTER TABLE postgrest_api.taxa_reference_specimens OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_reference_specimens TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.season_types AS SELECT tbl_season_types."season_type_id", tbl_season_types."date_updated", tbl_season_types."description", tbl_season_types."season_type" FROM tbl_season_types;
ALTER TABLE postgrest_api.season_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.season_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.seasons AS SELECT tbl_seasons."season_id", tbl_seasons."date_updated", tbl_seasons."season_name", tbl_seasons."season_type", tbl_seasons."season_type_id", tbl_seasons."sort_order" FROM tbl_seasons;
ALTER TABLE postgrest_api.seasons OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.seasons TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.site_images AS SELECT tbl_site_images."site_image_id", tbl_site_images."contact_id", tbl_site_images."credit", tbl_site_images."date_taken", tbl_site_images."date_updated", tbl_site_images."description", tbl_site_images."image_location", tbl_site_images."image_name", tbl_site_images."image_type_id", tbl_site_images."site_id" FROM tbl_site_images;
ALTER TABLE postgrest_api.site_images OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.site_images TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.species_associations AS SELECT tbl_species_associations."species_association_id", tbl_species_associations."associated_taxon_id", tbl_species_associations."biblio_id", tbl_species_associations."date_updated", tbl_species_associations."taxon_id", tbl_species_associations."association_type_id", tbl_species_associations."referencing_type" FROM tbl_species_associations;
ALTER TABLE postgrest_api.species_associations OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.species_associations TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.site_references AS SELECT tbl_site_references."site_reference_id", tbl_site_references."site_id", tbl_site_references."biblio_id", tbl_site_references."date_updated" FROM tbl_site_references;
ALTER TABLE postgrest_api.site_references OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.site_references TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.site_preservation_status AS SELECT tbl_site_preservation_status."site_preservation_status_id", tbl_site_preservation_status."site_id", tbl_site_preservation_status."preservation_status_or_threat", tbl_site_preservation_status."description", tbl_site_preservation_status."assessment_type", tbl_site_preservation_status."assessment_author_contact_id", tbl_site_preservation_status."date_updated", tbl_site_preservation_status."Evaluation_date" FROM tbl_site_preservation_status;
ALTER TABLE postgrest_api.site_preservation_status OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.site_preservation_status TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.species_association_types AS SELECT tbl_species_association_types."association_type_id", tbl_species_association_types."association_type_name", tbl_species_association_types."association_description", tbl_species_association_types."date_updated" FROM tbl_species_association_types;
ALTER TABLE postgrest_api.species_association_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.species_association_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.site_natgridrefs AS SELECT tbl_site_natgridrefs."site_natgridref_id", tbl_site_natgridrefs."site_id", tbl_site_natgridrefs."method_id", tbl_site_natgridrefs."natgridref", tbl_site_natgridrefs."date_updated" FROM tbl_site_natgridrefs;
ALTER TABLE postgrest_api.site_natgridrefs OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.site_natgridrefs TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.dendro_date_notes AS SELECT tbl_dendro_date_notes."dendro_date_note_id", tbl_dendro_date_notes."dendro_date_id", tbl_dendro_date_notes."note", tbl_dendro_date_notes."date_updated" FROM tbl_dendro_date_notes;
ALTER TABLE postgrest_api.dendro_date_notes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.dendro_date_notes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.age_types AS SELECT tbl_age_types."age_type_id", tbl_age_types."age_type", tbl_age_types."description", tbl_age_types."date_updated" FROM tbl_age_types;
ALTER TABLE postgrest_api.age_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.age_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.error_uncertainties AS SELECT tbl_error_uncertainties."error_uncertainty_id", tbl_error_uncertainties."error_uncertainty_type", tbl_error_uncertainties."description", tbl_error_uncertainties."date_updated" FROM tbl_error_uncertainties;
ALTER TABLE postgrest_api.error_uncertainties OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.error_uncertainties TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.season_or_qualifier AS SELECT tbl_season_or_qualifier."season_or_qualifier_id", tbl_season_or_qualifier."season_or_qualifier_type", tbl_season_or_qualifier."description", tbl_season_or_qualifier."date_updated" FROM tbl_season_or_qualifier;
ALTER TABLE postgrest_api.season_or_qualifier OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.season_or_qualifier TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_measured_attributes AS SELECT tbl_taxa_measured_attributes."measured_attribute_id", tbl_taxa_measured_attributes."attribute_measure", tbl_taxa_measured_attributes."attribute_type", tbl_taxa_measured_attributes."attribute_units", tbl_taxa_measured_attributes."data", tbl_taxa_measured_attributes."date_updated", tbl_taxa_measured_attributes."taxon_id" FROM tbl_taxa_measured_attributes;
ALTER TABLE postgrest_api.taxa_measured_attributes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_measured_attributes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.site_locations AS SELECT tbl_site_locations."site_location_id", tbl_site_locations."date_updated", tbl_site_locations."location_id", tbl_site_locations."site_id" FROM tbl_site_locations;
ALTER TABLE postgrest_api.site_locations OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.site_locations TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.text_distribution AS SELECT tbl_text_distribution."distribution_id", tbl_text_distribution."biblio_id", tbl_text_distribution."date_updated", tbl_text_distribution."distribution_text", tbl_text_distribution."taxon_id" FROM tbl_text_distribution;
ALTER TABLE postgrest_api.text_distribution OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.text_distribution TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.updates_log AS SELECT tbl_updates_log."updates_log_id", tbl_updates_log."table_name", tbl_updates_log."last_updated" FROM tbl_updates_log;
ALTER TABLE postgrest_api.updates_log OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.updates_log TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.years_types AS SELECT tbl_years_types."years_type_id", tbl_years_types."name", tbl_years_types."description", tbl_years_types."date_updated" FROM tbl_years_types;
ALTER TABLE postgrest_api.years_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.years_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.ceramics_lookup AS SELECT tbl_ceramics_lookup."ceramics_lookup_id", tbl_ceramics_lookup."method_id", tbl_ceramics_lookup."description", tbl_ceramics_lookup."name", tbl_ceramics_lookup."date_updated" FROM tbl_ceramics_lookup;
ALTER TABLE postgrest_api.ceramics_lookup OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.ceramics_lookup TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.aggregate_samples AS SELECT tbl_aggregate_samples."aggregate_sample_id", tbl_aggregate_samples."aggregate_dataset_id", tbl_aggregate_samples."analysis_entity_id", tbl_aggregate_samples."aggregate_sample_name", tbl_aggregate_samples."date_updated" FROM tbl_aggregate_samples;
ALTER TABLE postgrest_api.aggregate_samples OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.aggregate_samples TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.abundances AS SELECT tbl_abundances."abundance_id", tbl_abundances."taxon_id", tbl_abundances."analysis_entity_id", tbl_abundances."abundance_element_id", tbl_abundances."abundance", tbl_abundances."date_updated" FROM tbl_abundances;
ALTER TABLE postgrest_api.abundances OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.abundances TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.abundance_modifications AS SELECT tbl_abundance_modifications."abundance_modification_id", tbl_abundance_modifications."abundance_id", tbl_abundance_modifications."modification_type_id", tbl_abundance_modifications."date_updated" FROM tbl_abundance_modifications;
ALTER TABLE postgrest_api.abundance_modifications OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.abundance_modifications TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.alt_ref_types AS SELECT tbl_alt_ref_types."alt_ref_type_id", tbl_alt_ref_types."alt_ref_type", tbl_alt_ref_types."date_updated", tbl_alt_ref_types."description" FROM tbl_alt_ref_types;
ALTER TABLE postgrest_api.alt_ref_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.alt_ref_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.analysis_entities AS SELECT tbl_analysis_entities."analysis_entity_id", tbl_analysis_entities."physical_sample_id", tbl_analysis_entities."dataset_id", tbl_analysis_entities."date_updated" FROM tbl_analysis_entities;
ALTER TABLE postgrest_api.analysis_entities OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.analysis_entities TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.data_types AS SELECT tbl_data_types."data_type_id", tbl_data_types."data_type_group_id", tbl_data_types."data_type_name", tbl_data_types."date_updated", tbl_data_types."definition" FROM tbl_data_types;
ALTER TABLE postgrest_api.data_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.data_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_tree_master AS SELECT tbl_taxa_tree_master."taxon_id", tbl_taxa_tree_master."author_id", tbl_taxa_tree_master."date_updated", tbl_taxa_tree_master."genus_id", tbl_taxa_tree_master."species" FROM tbl_taxa_tree_master;
ALTER TABLE postgrest_api.taxa_tree_master OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_tree_master TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_tree_genera AS SELECT tbl_taxa_tree_genera."genus_id", tbl_taxa_tree_genera."date_updated", tbl_taxa_tree_genera."family_id", tbl_taxa_tree_genera."genus_name" FROM tbl_taxa_tree_genera;
ALTER TABLE postgrest_api.taxa_tree_genera OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_tree_genera TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.geochronology AS SELECT tbl_geochronology."geochron_id", tbl_geochronology."analysis_entity_id", tbl_geochronology."dating_lab_id", tbl_geochronology."lab_number", tbl_geochronology."age", tbl_geochronology."error_older", tbl_geochronology."error_younger", tbl_geochronology."delta_13c", tbl_geochronology."notes", tbl_geochronology."date_updated", tbl_geochronology."dating_uncertainty_id" FROM tbl_geochronology;
ALTER TABLE postgrest_api.geochronology OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.geochronology TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.features AS SELECT tbl_features."feature_id", tbl_features."feature_type_id", tbl_features."feature_name", tbl_features."feature_description", tbl_features."date_updated" FROM tbl_features;
ALTER TABLE postgrest_api.features OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.features TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.horizons AS SELECT tbl_horizons."horizon_id", tbl_horizons."date_updated", tbl_horizons."description", tbl_horizons."horizon_name", tbl_horizons."method_id" FROM tbl_horizons;
ALTER TABLE postgrest_api.horizons OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.horizons TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.image_types AS SELECT tbl_image_types."image_type_id", tbl_image_types."date_updated", tbl_image_types."description", tbl_image_types."image_type" FROM tbl_image_types;
ALTER TABLE postgrest_api.image_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.image_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.chronologies AS SELECT tbl_chronologies."chronology_id", tbl_chronologies."age_bound_older", tbl_chronologies."age_bound_younger", tbl_chronologies."age_model", tbl_chronologies."chronology_name", tbl_chronologies."contact_id", tbl_chronologies."date_prepared", tbl_chronologies."date_updated", tbl_chronologies."is_default", tbl_chronologies."notes", tbl_chronologies."sample_group_id", tbl_chronologies."relative_age_type_id" FROM tbl_chronologies;
ALTER TABLE postgrest_api.chronologies OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.chronologies TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_description_sample_group_contexts AS SELECT tbl_sample_description_sample_group_contexts."sample_description_sample_group_context_id", tbl_sample_description_sample_group_contexts."sampling_context_id", tbl_sample_description_sample_group_contexts."sample_description_type_id", tbl_sample_description_sample_group_contexts."date_updated" FROM tbl_sample_description_sample_group_contexts;
ALTER TABLE postgrest_api.sample_description_sample_group_contexts OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_description_sample_group_contexts TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_colours AS SELECT tbl_sample_colours."sample_colour_id", tbl_sample_colours."colour_id", tbl_sample_colours."date_updated", tbl_sample_colours."physical_sample_id" FROM tbl_sample_colours;
ALTER TABLE postgrest_api.sample_colours OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_colours TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.record_types AS SELECT tbl_record_types."record_type_id", tbl_record_types."record_type_name", tbl_record_types."record_type_description", tbl_record_types."date_updated" FROM tbl_record_types;
ALTER TABLE postgrest_api.record_types OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.record_types TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.rdb AS SELECT tbl_rdb."rdb_id", tbl_rdb."location_id", tbl_rdb."rdb_code_id", tbl_rdb."taxon_id", tbl_rdb."date_updated" FROM tbl_rdb;
ALTER TABLE postgrest_api.rdb OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.rdb TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_location_type_sampling_contexts AS SELECT tbl_sample_location_type_sampling_contexts."sample_location_type_sampling_context_id", tbl_sample_location_type_sampling_contexts."sampling_context_id", tbl_sample_location_type_sampling_contexts."sample_location_type_id", tbl_sample_location_type_sampling_contexts."date_updated" FROM tbl_sample_location_type_sampling_contexts;
ALTER TABLE postgrest_api.sample_location_type_sampling_contexts OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_location_type_sampling_contexts TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sites AS SELECT tbl_sites."site_id", tbl_sites."altitude", tbl_sites."latitude_dd", tbl_sites."longitude_dd", tbl_sites."national_site_identifier", tbl_sites."site_description", tbl_sites."site_name", tbl_sites."site_preservation_status_id", tbl_sites."date_updated", tbl_sites."site_location_accuracy" FROM tbl_sites;
ALTER TABLE postgrest_api.sites OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sites TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_descriptions AS SELECT tbl_sample_descriptions."sample_description_id", tbl_sample_descriptions."sample_description_type_id", tbl_sample_descriptions."physical_sample_id", tbl_sample_descriptions."description", tbl_sample_descriptions."date_updated" FROM tbl_sample_descriptions;
ALTER TABLE postgrest_api.sample_descriptions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_descriptions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_group_dimensions AS SELECT tbl_sample_group_dimensions."sample_group_dimension_id", tbl_sample_group_dimensions."date_updated", tbl_sample_group_dimensions."dimension_id", tbl_sample_group_dimensions."dimension_value", tbl_sample_group_dimensions."sample_group_id" FROM tbl_sample_group_dimensions;
ALTER TABLE postgrest_api.sample_group_dimensions OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_group_dimensions TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.relative_age_refs AS SELECT tbl_relative_age_refs."relative_age_ref_id", tbl_relative_age_refs."biblio_id", tbl_relative_age_refs."date_updated", tbl_relative_age_refs."relative_age_id" FROM tbl_relative_age_refs;
ALTER TABLE postgrest_api.relative_age_refs OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.relative_age_refs TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.sample_coordinates AS SELECT tbl_sample_coordinates."sample_coordinate_id", tbl_sample_coordinates."physical_sample_id", tbl_sample_coordinates."coordinate_method_dimension_id", tbl_sample_coordinates."measurement", tbl_sample_coordinates."accuracy", tbl_sample_coordinates."date_updated" FROM tbl_sample_coordinates;
ALTER TABLE postgrest_api.sample_coordinates OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.sample_coordinates TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxonomy_notes AS SELECT tbl_taxonomy_notes."taxonomy_notes_id", tbl_taxonomy_notes."biblio_id", tbl_taxonomy_notes."date_updated", tbl_taxonomy_notes."taxon_id", tbl_taxonomy_notes."taxonomy_notes" FROM tbl_taxonomy_notes;
ALTER TABLE postgrest_api.taxonomy_notes OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxonomy_notes TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_synonyms AS SELECT tbl_taxa_synonyms."synonym_id", tbl_taxa_synonyms."biblio_id", tbl_taxa_synonyms."date_updated", tbl_taxa_synonyms."family_id", tbl_taxa_synonyms."genus_id", tbl_taxa_synonyms."notes", tbl_taxa_synonyms."taxon_id", tbl_taxa_synonyms."author_id", tbl_taxa_synonyms."synonym", tbl_taxa_synonyms."reference_type" FROM tbl_taxa_synonyms;
ALTER TABLE postgrest_api.taxa_synonyms OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_synonyms TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.text_identification_keys AS SELECT tbl_text_identification_keys."key_id", tbl_text_identification_keys."biblio_id", tbl_text_identification_keys."date_updated", tbl_text_identification_keys."key_text", tbl_text_identification_keys."taxon_id" FROM tbl_text_identification_keys;
ALTER TABLE postgrest_api.text_identification_keys OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.text_identification_keys TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxonomic_order_biblio AS SELECT tbl_taxonomic_order_biblio."taxonomic_order_biblio_id", tbl_taxonomic_order_biblio."biblio_id", tbl_taxonomic_order_biblio."date_updated", tbl_taxonomic_order_biblio."taxonomic_order_system_id" FROM tbl_taxonomic_order_biblio;
ALTER TABLE postgrest_api.taxonomic_order_biblio OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxonomic_order_biblio TO sead_read;

CREATE OR REPLACE VIEW postgrest_api.taxa_tree_families AS SELECT tbl_taxa_tree_families."family_id", tbl_taxa_tree_families."date_updated", tbl_taxa_tree_families."family_name", tbl_taxa_tree_families."order_id" FROM tbl_taxa_tree_families;
ALTER TABLE postgrest_api.taxa_tree_families OWNER TO sead_master;
GRANT SELECT ON TABLE postgrest_api.taxa_tree_families TO sead_read;

