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

def generateRoleSQL():
    priv = getConfig("privileges")
    roleSQL = "CREATE ROLE "+priv["grantread"]+" NOLOGIN;\n"
    roleSQL += "GRANT "+priv["grantread"]+" TO "+priv["viewowner"]+";\n"
    return roleSQL

#This function reads a template file containing the definition of a number of views and then inserts the correct parameters into it and then returns the SQL
def generateSchemaSQL():
    schema = getConfig("schema")
    priv = getConfig("privileges")
    schemaSQL = "CREATE SCHEMA IF NOT EXISTS "+schema["name"]+";\n";
    schemaSQL += "GRANT USAGE ON SCHEMA "+schema["name"]+" TO "+priv["viewowner"]+";\n"
    schemaSQL += "GRANT USAGE ON SCHEMA "+schema["name"]+" TO "+priv["grantread"]+";\n"
    return schemaSQL

#This function reads the tables in the "public" schema and creates a view for each table (in the postgrest schema) which just mirrors that table exactly
def generateSqlFromTables():

    db = getConfig("postgresql")
    priv = getConfig("privileges")
    schema = getConfig("schema")

    #Connect to db
    conn = psycopg2.connect(**db)

    #get the information about the tables which acts as the templates for our views
    sourceSchema = "public"
    targetSchema = schema["name"]
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
        
        createViewSQL += " FROM "+sourceSchema+"."+tableName+";\n"
        createViewSQL += "ALTER TABLE "+targetSchema+"."+viewName+" OWNER TO "+priv["viewowner"]+";\n"
        createViewSQL += "GRANT SELECT ON TABLE "+targetSchema+"."+viewName+" TO "+priv["grantread"]+";\n"
        viewsSQL.append(createViewSQL)
    
    output = ""
    for vs in viewsSQL:
        #print(vs)
        output += vs
        #cur.execute(vs) #This doesn't work for some reason...
    return output

def generateSqlFromQseTemplate():
    priv = getConfig("privileges")
    schema = getConfig("schema")
    templateFile = open("qse_views.template.sql","r")
    template = templateFile.read()

    template = template.replace("<schema>", schema["name"])
    template = template.replace("<viewowner>", priv["viewowner"])
    template = template.replace("<grantread>", priv["grantread"])

    return template

def getTemperatureProxyTable():
    with open ("tbl_temperatures.sql", "r") as file:
        data = file.readlines()

    sql = ""
    for i in range(len(data)):
        sql += data[i]
        
    return sql

print("BEGIN;") #Start transaction
print(generateRoleSQL())
print(generateSchemaSQL())
print(getTemperatureProxyTable())
print(generateSqlFromTables())
print(generateSqlFromQseTemplate())
print("COMMIT;") #End transaction
