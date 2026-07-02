import requests
import xml.etree.ElementTree as ET

url = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'
res = requests.get(url)
root = ET.fromstring(res.content)

ns = {'atom': 'http://www.w3.org/2005/Atom'}

for entry in root.findall('atom:entry', ns)[:3]:
    title = entry.find('atom:title', ns).text
    updated = entry.find('atom:updated', ns).text
    link = entry.find('atom:link', ns).attrib.get('href', '')
    content = entry.find('atom:content', ns).text
    print(f"Title: {title}")
    print(f"Updated: {updated}")
    print(f"Link: {link}")
    print(f"Content snippet: {content[:300]}")
    print("-" * 50)
