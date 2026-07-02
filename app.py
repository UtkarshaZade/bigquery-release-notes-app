from flask import Flask, jsonify, render_template, request
import requests
import xml.etree.ElementTree as ET
import re
import html
from datetime import datetime

app = Flask(__name__)

# Feed URL
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    "data": None,
    "last_fetched": None
}

def clean_html(raw_html):
    """Clean and sanitize HTML content slightly if needed, keeping it safe and tidy."""
    if not raw_html:
        return ""
    # We want to keep links, lists, code, and paragraphs, but ensure tags are balanced
    return raw_html.strip()

def parse_xml_feed(xml_content):
    """Parse the Atom feed and structure release notes."""
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        raise ValueError(f"Failed to parse XML: {str(e)}")

    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = []
    
    # Pattern to find <h3>Category</h3> followed by body text up to next <h3> or end of string
    pattern = re.compile(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', re.DOTALL | re.IGNORECASE)

    for entry_elem in root.findall('atom:entry', ns):
        title = entry_elem.find('atom:title', ns)
        title_text = title.text.strip() if title is not None else "Unknown Date"
        
        updated = entry_elem.find('atom:updated', ns)
        updated_text = updated.text.strip() if updated is not None else ""
        
        link = entry_elem.find('atom:link', ns)
        link_url = ""
        if link is not None:
            link_url = link.attrib.get('href', '')
            
        content_elem = entry_elem.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        # Parse individual items in the content
        items = []
        if content_html:
            matches = pattern.findall(content_html)
            for note_type, body in matches:
                cleaned_body = clean_html(body)
                items.append({
                    "type": note_type.strip(),
                    "body": cleaned_body
                })
        
        # If pattern didn't match anything, check if there's raw content
        if not items and content_html:
            items.append({
                "type": "General",
                "body": clean_html(content_html)
            })

        # Format human-readable date if possible
        formatted_date = title_text
        try:
            # Try parsing e.g. "July 01, 2026"
            dt = datetime.strptime(title_text, "%B %d, %Y")
            formatted_date = dt.strftime("%A, %B %d, %Y")
        except Exception:
            pass

        entries.append({
            "date": title_text,
            "formatted_date": formatted_date,
            "updated": updated_text,
            "link": link_url,
            "items": items
        })
        
    return entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    if cache["data"] is not None and not force_refresh:
        return jsonify({
            "status": "success",
            "source": "cache",
            "last_fetched": cache["last_fetched"],
            "data": cache["data"]
        })
        
    try:
        # Fetch the feed
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse feed
        entries = parse_xml_feed(response.content)
        
        # Update cache
        cache["data"] = entries
        cache["last_fetched"] = datetime.now().isoformat()
        
        return jsonify({
            "status": "success",
            "source": "network",
            "last_fetched": cache["last_fetched"],
            "data": entries
        })
    except requests.exceptions.RequestException as e:
        # Fallback to cache if request fails, but return error status
        if cache["data"] is not None:
            return jsonify({
                "status": "partial_error",
                "message": f"Failed to refresh data: {str(e)}. Displaying cached data.",
                "source": "cache",
                "last_fetched": cache["last_fetched"],
                "data": cache["data"]
            }), 200
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch release notes: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An error occurred: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
