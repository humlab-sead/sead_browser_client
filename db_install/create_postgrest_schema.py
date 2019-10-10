import psycopg2
from configparser import ConfigParser

#Function for getting a section of the config as a dict
def getConfig(section):
    parser = ConfigParser()
    parser.read("database.cfg")

    config = {}
    if parser.has_section(section):
        params = parser.items(section)
        for param in params:
            config[param[0]] = param[1]

    return config

def generateSqlFromTables():

    db = getConfig("postgresql")
    priv = getConfig("privileges")

    #Connect to db
    conn = psycopg2.connect(**db)

    #get the information about the tables which acts as the templates for our views
    sourceSchema = "public"
    targetSchema = "postgrest_api"
    cur = conn.cursor()
    cur.execute("SELECT * FROM information_schema.tables WHERE table_schema = '"+sourceSchema+"'")
    tables = cur.fetchall()

    viewsSQL = []

    #For each table...
    for table in tables:
        tableName = table[2];
        viewName = tableName[4:] #strip "tbl_" prefix

        createViewSQL = "CREATE OR REPLACE VIEW "+targetSchema+"."+viewName+" AS SELECT "

        #get columns
        cur.execute("SELECT * FROM information_schema.columns WHERE table_schema = '"+sourceSchema+"' AND table_name = '"+tableName+"'");
        columns = cur.fetchall()

        #For each column in this table...
        for column in columns:
            columnName = column[3]
            createViewSQL += tableName+'.\"'+columnName+'\", ' #Column name needs to be within "" since there (at this point in time) is one column name containing an upper case letter and postgresql automatically lower-cases the whole SQL-string unless you double quote it, causing the SQL query to fail

        #remove last 2 chars
        createViewSQL = createViewSQL[:-2]
        
        createViewSQL += " FROM "+tableName+";\n"
        createViewSQL += "ALTER TABLE "+targetSchema+"."+viewName+" OWNER TO "+priv["viewowner"]+";\n"
        createViewSQL += "GRANT SELECT ON TABLE "+targetSchema+"."+viewName+" TO "+priv["grantread"]+";\n"
        viewsSQL.append(createViewSQL)


    schemaSQL = "CREATE SCHEMA IF NOT EXISTS "+targetSchema+";\n";
    schemaSQL += "GRANT USAGE ON SCHEMA "+targetSchema+" TO "+priv["viewowner"]+";\n"
    schemaSQL += "GRANT USAGE ON SCHEMA "+targetSchema+" TO "+priv["grantread"]+";\n"


    #Creating the schema and views doesn't work some reason that I don't understand. It seems to accept the queries just fine but nothing happens. So I'm currently just using this script to generate the SQL which I then run through psql (which works).
    #print("Executing:\n")
    print(schemaSQL)
    #cur.execute(schemaSQL) #This doesn't work for some reason...

    for vs in viewsSQL:
        print(vs)
        #cur.execute(vs) #This doesn't work for some reason...


def generateSqlFromQseTemplate():
    priv = getConfig("privileges")
    schema = getConfig("schema")
    templateFile = open("qse_views.template.sql","r")
    template = templateFile.read()

    template = template.replace("<schema>", schema["name"])
    template = template.replace("<viewowner>", priv["viewowner"])
    template = template.replace("<grantread>", priv["grantread"])

    print(template)



generateSqlFromTables()
generateSqlFromQseTemplate()
