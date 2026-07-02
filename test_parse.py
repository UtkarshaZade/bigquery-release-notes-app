import requests
import xml.etree.ElementTree as ET
import re

url = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'
res = requests.get(url)
root = ET.fromstring(res.content)

ns = {'atom': 'http://www.w3.org/2005/Atom'}

pattern = re.compile(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', re.DOTALL | re.IGNORECASE)

for entry in root.findall('atom:entry', ns)[:5]:
    title = entry.find('atom:title', ns).text
    content = entry.find('atom:content', ns).text
    matches = pattern.findall(content)
    print(f"Date: {title}")
    for note_type, body in matches:
        print(f"  [{note_type.strip()}] -> {body.strip()[:100]}...")
    print("-" * 50)
