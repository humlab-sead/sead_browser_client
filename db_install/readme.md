# VISEAD Auxiliary Database Install Script

This script will help generate the SQL required for building the PostgREST API db schema with views, which is primarily used for fetching data to the site reports / landing pages on the VISEAD site.
It does not actually create the schema, roles or views, it just generates the SQL which will allow you to do so.

## Prerequisites

* VISEAD database must be installed. There should be a "public" schema containing all the tables.
* User used for loading SQL must of course have write access.
* Make a database.cfg based on the example file provided.
  * The two special tags under "Privileges" section is:
    * viewowner = The name of the Postgres role which will be set as owner of the created views.
    * grantread = The name of a Postgres role which will be given SELECT (only) privileges on the views.


Steps for running:

1. `python3 create_postgrest_schema.py > schema.sql`
2. `psql <specify connection details here> < schema.sql`


## Problems
* Temperature table is not created yet when the script scans for which tables to include in the postgrest schema, thus it's not included and has to be inserted manually afterwards.