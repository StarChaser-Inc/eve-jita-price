import yaml
import json
import gzip

with open('types.yaml', 'r', encoding='utf-8') as file:
    data = yaml.safe_load(file)


json_data = []

for key, value in data.items():
    if "marketGroupID" in value:
        entry = {
            "id": int(key),
            "name": value["name"],
            "groupID": value["groupID"]
        }
        json_data.append(entry)


with gzip.open('types.json.gz', 'wt', encoding='utf-8') as gzip_file:
    json.dump(json_data, gzip_file, ensure_ascii=False, separators=(',', ':'))


