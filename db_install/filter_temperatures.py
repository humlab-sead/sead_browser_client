import csv

#data = open("temperature_data.csv", "r")



#print(data)


keptRows = ""


with open('temperature_data.csv') as csv_file:
	csv_reader = csv.reader(csv_file, delimiter='\t')
	keepRow = True
	for row in csv_reader:
		if keepRow:
			#print(row)
			keptRows += row[0]+","+row[1]+"\n"
			#keptRows.append(row[0]+","+row[1])
		temp = row[0]
		year = row[1]

		if keepRow:
			keepRow = False
		else:
			keepRow = True
		

print(keptRows)
#print(len(keptRows))
