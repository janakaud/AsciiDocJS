// its own line
multiline = {
	"```": "pre",
	"----": "pre"
};
// start of line
fullline = {
	"==== ": "h4",
	"=== ": "h3",
	"== ": "h2",
	"= ": "h1",
};
// start of line
lists = {
	"*": [/^\*+ /, "ul"],
	"-": [/^\-+ /, "ul"],
	".": [/^\.+ /, "ol"],
};
// single character support only!
paired = {
	"*": "b",
	"_": "i",
	"`": "code"
};
special = {
	image: function(value) {
		return value.replace(/image::([^\[]+)\[([^\]]*)\]/g,
			wrap(wrap("", "img", "src=\"$1\" alt=\"$2\""), "p", "style=\"text-align: center\""));
	},
	arrow: function(value) {
		return safeReplace(value, /->/g, "&rarr;");
	},
	mdash: function(value) {
		return safeReplace(value, /--/g, "&mdash;");
	},
	urlType1: function(value) {
		return value.replace(/<<([^,]+),([^>]+)>>/g, function(whole, url, text) {
			return wrap(text, "a", "target=\"_blank\" href=\"" + url.replace(/\.ad(oc|)#$/, ".html") + "\"");
		});
	},
	urlType2: function(value) {
		return value.replace(/((https?:\/\/|mailto:)[^\s]+)\[([^\]]+)\]/g, wrap("$3", "a", "target=\"_blank\" href=\"$1\""));
	}
};
skip = ["+"];

stack = [];
stack.peek = function() {
	return stack[stack.length - 1];
};

function parse(adoc) {
	lines = adoc.split(/\n/g);
	html = [];

outer:
	for (i in lines) {
		for (j in skip) {
			if (lines[i] == skip[j]) {
				html[i] = "";
				continue outer;
			}
		}

		done = false;
		html[i] = lines[i];
		for (token in multiline) {
			if (html[i] == token) {
				opened = stack.indexOf(token);
				html[i] = reachStack(token);
				if (opened > -1) {
					html[i] += closeTag(multiline[token]);
				}
				done = true;
				break;
			}
		}

		// don't ruin multiline blocks
		if (!multiline[stack.peek()]) {
			if (!done) {
				for (token in fullline) {
					if (html[i].startsWith(token)) {
						html[i] = openTag(fullline[token], token) + html[i].substring(token.length);
						done = true;
						break;
					}
				}
			}

			for (key in lists) {
				token = (html[i].match(lists[key][0]) || [])[0];
				if (token) {
					html[i] = reachStack(token) + openTag("li", "li" + token) + html[i].substring(token.length);
					done = true;
					break;
				}
			}

			for (key in paired) {
				html[i] = safeReplace(html[i], pairRegex[key], function(value) {
					return wrap(value.substring(key.length, value.length - key.length), paired[key]);
				});
			}

			for (key in special) {
				html[i] = special[key](html[i]);
			}
		} else if (!done) {
			// inside a multiline block; not at the start (e.g. <pre> line)
			html[i] = html[i].replace(/</g, "&lt;");
		}

		if (html[i] == "") {
			html[i] = multiline[stack.peek()] ? "\n" : closeAll();
		} else if (!done) {
			html[i] = (stack.length == 0 ? openTag("p", "") : (multiline[stack.peek()] ? "\n" : " ")) + html[i];
		}
	}

	html[i] += closeAll();
	return html.join("");
}

function noReplace(pos, line, token) {
	if ((line.substring(0, pos).split(/`|<\/?code>/).length - 1) % 2 != 0) {	//we're inside a code block!
		return true;
	}
	prevSpace = line.lastIndexOf(" ", pos);
	if (prevSpace < 0) {
		prevSpace = 0;
	}
	nextSpace = line.indexOf(" ", pos);
	if (nextSpace < 0) {
		nextSpace = line.length;
	}
	prevColon = line.lastIndexOf("::", pos);
	prevDblAnglBrkt = line.lastIndexOf("<<", pos);
	nextSqBrkt = line.indexOf("[", pos);
	nextCloseSqBrkt = line.indexOf("]", pos);

	return (
		// image::http://localhost/test_image_1 (no-replace) vs image::http://localhost/test _image_1
		(prevColon >= 0 && prevSpace < prevColon) ||

		// <<foo_bar_baz.ad,file foo>> (no-replace) vs <<foo.ad,file _foo_>>
		(prevDblAnglBrkt >= 0 && prevSpace < prevDblAnglBrkt) ||

		// http://localhost/test_image_1[foo] (no-replace) vs http://localhost/test[_image_1 foo]
		// but _[foo bar]_ should be replaced
		(nextSqBrkt >= 0 && nextSpace > nextSqBrkt && nextCloseSqBrkt >= 0 && /[\s\.,;:]/.test(line[nextCloseSqBrkt + 1]))
	);
}

function reachStack(token) {
	pos = stack.indexOf(token);
	result = "";
	if (pos > -1) {
		result = closeAll(pos);
	} else {
		result = openTag(getTag(token), token);
	}
	return result;
}

function closeAll(maxPos) {
	if (!maxPos && maxPos != 0) {
		maxPos = -1;
	}
	result = "";
	while (stack.length > maxPos + 1) {
		shut = stack.peek();
		if (multiline[shut]) {
			break;
		}
		result += closeTag(getTag(shut));
	}
	return result;
}

function getTag(token) {
	if (multiline[token]) {
		return multiline[token];
	}
	if (fullline[token]) {
		return fullline[token];
	}
	if (token == "") {
		return "p";
	}
	if (token.startsWith("li")) {
		return "li";
	}
	return lists[token.charAt(0)][1];
}

function regEscape(text) {
	return text.replace(/\*/g, "\\$&");
}

function wrap(text, tag, extras) {
	return openTag(tag, null, extras) + text + closeTag(tag);
}

function openTag(tag, token, extras) {
	stack.push(token);
	return getOpenTag(tag, extras);
}

function getOpenTag(tag, extras) {
	return "<" + (extras ? tag + " " + extras : tag) + ">";
}

function closeTag(tag) {
	stack.pop();
	return getCloseTag(tag);
}

function getCloseTag(tag) {
	return "</" + tag + ">";
}

function safeReplace(line, regex, sub) {
	return line.replace(regex, function() {
		var value = arguments[0];
		var pos = arguments[arguments.length - 2];
		var full = arguments[arguments.length - 1];
		return noReplace(pos, full, value) ? value : sub instanceof Function ? sub(value) : sub;
	});
}

pairRegex = {};
Object.entries(paired).forEach(function(entry) {
	escaped = regEscape(entry[0]);
	noSqBracRegex = "[^" + escaped + "\\`\\[]+";
	pairRegex[entry[0]] = new RegExp(escaped + "(" + noSqBracRegex + ")?" + "(\\[" + noSqBracRegex + "\\])*(" + noSqBracRegex + ")?" + escaped, "g");
});