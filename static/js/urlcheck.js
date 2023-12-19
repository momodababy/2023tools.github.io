// js编码解码 punyCode => https://www.cnblogs.com/xiaoyaodijun/p/8421286.html
;(function(w) {
    var PunycodeModule = function () {

        function IdnMapping() {
            this.utf16 = {
                decode: function (input) {
                    var output = [], i = 0, len = input.length, value, extra;
                    while (i < len) {
                        value = input.charCodeAt(i++);
                        if ((value & 0xF800) === 0xD800) {
                            extra = input.charCodeAt(i++);
                            if (((value & 0xFC00) !== 0xD800) || ((extra & 0xFC00) !== 0xDC00)) {
                                throw new RangeError("UTF-16(decode): Illegal UTF-16 sequence");
                            }
                            value = ((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000;
                        }
                        output.push(value);
                    }
                    return output;
                },
                encode: function (input) {
                    var output = [], i = 0, len = input.length, value;
                    while (i < len) {
                        value = input[i++];
                        if ((value & 0xF800) === 0xD800) {
                            throw new RangeError("UTF-16(encode): Illegal UTF-16 value");
                        }
                        if (value > 0xFFFF) {
                            value -= 0x10000;
                            output.push(String.fromCharCode(((value >>> 10) & 0x3FF) | 0xD800));
                            value = 0xDC00 | (value & 0x3FF);
                        }
                        output.push(String.fromCharCode(value));
                    }
                    return output.join("");
                }
            }

            var initial_n = 0x80;
            var initial_bias = 72;
            var delimiter = "\x2D";
            var base = 36;
            var damp = 700;
            var tmin = 1;
            var tmax = 26;
            var skew = 38;
            var maxint = 0x7FFFFFFF;

            function decode_digit(cp) {
                return cp - 48 < 10 ? cp - 22 : cp - 65 < 26 ? cp - 65 : cp - 97 < 26 ? cp - 97 : base;
            }

            function encode_digit(d, flag) {
                return d + 22 + 75 * (d < 26) - ((flag != 0) << 5);

            }
            function adapt(delta, numpoints, firsttime) {
                var k;
                delta = firsttime ? Math.floor(delta / damp) : (delta >> 1);
                delta += Math.floor(delta / numpoints);

                for (k = 0; delta > (((base - tmin) * tmax) >> 1) ; k += base) {
                    delta = Math.floor(delta / (base - tmin));
                }
                return Math.floor(k + (base - tmin + 1) * delta / (delta + skew));
            }


            function encode_basic(bcp, flag) {
                bcp -= (bcp - 97 < 26) << 5;
                return bcp + ((!flag && (bcp - 65 < 26)) << 5);
            }

            this.decode = function (input, preserveCase) {
                // Dont use utf16
                var output = [];
                var case_flags = [];
                var input_length = input.length;

                var n, out, i, bias, basic, j, ic, oldi, w, k, digit, t, len;

                // Initialize the state:

                n = initial_n;
                i = 0;
                bias = initial_bias;

                // Handle the basic code points: Let basic be the number of input code
                // points before the last delimiter, or 0 if there is none, then
                // copy the first basic code points to the output.

                basic = input.lastIndexOf(delimiter);
                if (basic < 0) basic = 0;

                for (j = 0; j < basic; ++j) {
                    if (preserveCase) case_flags[output.length] = (input.charCodeAt(j) - 65 < 26);
                    if (input.charCodeAt(j) >= 0x80) {
                        throw new RangeError("Illegal input >= 0x80");
                    }
                    output.push(input.charCodeAt(j));
                }

                // Main decoding loop: Start just after the last delimiter if any
                // basic code points were copied; start at the beginning otherwise.

                for (ic = basic > 0 ? basic + 1 : 0; ic < input_length;) {

                    // ic is the index of the next character to be consumed,

                    // Decode a generalized variable-length integer into delta,
                    // which gets added to i. The overflow checking is easier
                    // if we increase i as we go, then subtract off its starting
                    // value at the end to obtain delta.
                    for (oldi = i, w = 1, k = base; ; k += base) {
                        if (ic >= input_length) {
                            throw RangeError("punycode_bad_input(1)");
                        }
                        digit = decode_digit(input.charCodeAt(ic++));

                        if (digit >= base) {
                            throw RangeError("punycode_bad_input(2)");
                        }
                        if (digit > Math.floor((maxint - i) / w)) {
                            throw RangeError("punycode_overflow(1)");
                        }
                        i += digit * w;
                        t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
                        if (digit < t) { break; }
                        if (w > Math.floor(maxint / (base - t))) {
                            throw RangeError("punycode_overflow(2)");
                        }
                        w *= (base - t);
                    }

                    out = output.length + 1;
                    bias = adapt(i - oldi, out, oldi === 0);

                    // i was supposed to wrap around from out to 0,
                    // incrementing n each time, so we'll fix that now:
                    if (Math.floor(i / out) > maxint - n) {
                        throw RangeError("punycode_overflow(3)");
                    }
                    n += Math.floor(i / out);
                    i %= out;

                    // Insert n at position i of the output:
                    // Case of last character determines uppercase flag:
                    if (preserveCase) { case_flags.splice(i, 0, input.charCodeAt(ic - 1) - 65 < 26); }

                    output.splice(i, 0, n);
                    i++;
                }
                if (preserveCase) {
                    for (i = 0, len = output.length; i < len; i++) {
                        if (case_flags[i]) {
                            output[i] = (String.fromCharCode(output[i]).toUpperCase()).charCodeAt(0);
                        }
                    }
                }
                return this.utf16.encode(output);
            };


            this.encode = function (input, preserveCase) {
                //** Bias adaptation function **

                var n, delta, h, b, bias, j, m, q, k, t, ijv, case_flags;

                if (preserveCase) {
                    // Preserve case, step1 of 2: Get a list of the unaltered string
                    case_flags = this.utf16.decode(input);
                }
                // Converts the input in UTF-16 to Unicode
                input = this.utf16.decode(input.toLowerCase());

                var input_length = input.length; // Cache the length

                if (preserveCase) {
                    // Preserve case, step2 of 2: Modify the list to true/false
                    for (j = 0; j < input_length; j++) {
                        case_flags[j] = input[j] != case_flags[j];
                    }
                }

                var output = [];


                // Initialize the state:
                n = initial_n;
                delta = 0;
                bias = initial_bias;

                // Handle the basic code points:
                for (j = 0; j < input_length; ++j) {
                    if (input[j] < 0x80) {
                        output.push(
                            String.fromCharCode(
                                case_flags ? encode_basic(input[j], case_flags[j]) : input[j]
                            )
                        );
                    }
                }

                h = b = output.length;

                // h is the number of code points that have been handled, b is the
                // number of basic code points

                if (b > 0) output.push(delimiter);

                // Main encoding loop:
                //
                while (h < input_length) {
                    // All non-basic code points < n have been
                    // handled already. Find the next larger one:

                    for (m = maxint, j = 0; j < input_length; ++j) {
                        ijv = input[j];
                        if (ijv >= n && ijv < m) m = ijv;
                    }

                    // Increase delta enough to advance the decoder's
                    // <n,i> state to <m,0>, but guard against overflow:

                    if (m - n > Math.floor((maxint - delta) / (h + 1))) {
                        throw RangeError("punycode_overflow (1)");
                    }
                    delta += (m - n) * (h + 1);
                    n = m;

                    for (j = 0; j < input_length; ++j) {
                        ijv = input[j];

                        if (ijv < n) {
                            if (++delta > maxint) return Error("punycode_overflow(2)");
                        }

                        if (ijv == n) {
                            // Represent delta as a generalized variable-length integer:
                            for (q = delta, k = base; ; k += base) {
                                t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
                                if (q < t) break;
                                output.push(String.fromCharCode(encode_digit(t + (q - t) % (base - t), 0)));
                                q = Math.floor((q - t) / (base - t));
                            }
                            output.push(String.fromCharCode(encode_digit(q, preserveCase && case_flags[j] ? 1 : 0)));
                            bias = adapt(delta, h + 1, h == b);
                            delta = 0;
                            ++h;
                        }
                    }

                    ++delta, ++n;
                }
                return output.join("");
            }
        }

        this.toASCII = function (domain) {
            var idn = new IdnMapping();
            var domainarray = domain.split(".");
            var out = [];
            for (var i = 0; i < domainarray.length; ++i) {
                var s = domainarray[i];
                out.push(
                    s.match(/[^A-Za-z0-9-]/) ?
                        "xn--" + idn.encode(s) :
                        s
                );
            }
            return out.join(".");
        }

        this.toUnicode = function (domain) {
            var idn = new IdnMapping();
            var domainarray = domain.split(".");
            var out = [];
            for (var i = 0; i < domainarray.length; ++i) {
                var s = domainarray[i];
                out.push(
                    s.match(/^xn--/) ?
                    idn.decode(s.slice(4)) :
                        s
                );
            }
            return out.join(".");
        }
    }

    w.idnMapping =  PunycodeModule;
})(window);

var idn = new idnMapping();
// var str = idn.toASCII("www.你好.com"); // 编码
// console.log(__toUnicode("https://www.2345.xn--p1ai/")); // https://www.2345.эрф

// 解码
function __toUnicode(s) {
    return idn.toUnicode(s);
}

/**
 * Javascript 判断域名合法性，JS域名格式检测
 * https://www.sojson.com/blog/312.html
 * https://www.fly63.com/article/detial/9757
 */
function DomainParser(domainName) {
    var input = domainName;
    var modifyName = domainName;
    var b_error = false;
    var message = "";

    DomainParser.prototype.parse = function() {
        if (!input || input.length==0) {
            failMessage('请填写域名，例如：sojson.com');
            return;
        }
        var labels = parseLabels();
        // console.log(labels);
        if (hasError()) {
            return;
        }
        if (labels.length==1) {
            failMessage('域名格式错误。请输入正确的域名格式，以“.”进行区分');
            return;
        }
        var topLabel = labels[labels.length-1];
        if (isDigitLabels(topLabel)) {
            failMessage("域名格式错误。请输入正确的域名格式，以“.”进行区分");
            return;
        }
        if (input.length>255) {
            failMessage('域名过长。每标号不得超过63个字符。由多个标号组成的完整域名总共不超过255个字符。');
            return;
        }
        var topLevel = parseTopLevel(labels);
        // console.log(topLevel);
        // console.log(typeof topLevel.labelIndex);
        // console.log(topLevel.labelIndex);
        // if (topLevel.labelIndex==0) {
        if(!topLevel.recognized){ // 这里判断顶级域名是否存在
            failMessage(topLevel.name+'是域名后缀，不能查询。');
            return;
        }
        var secondLevel = parseSecondLevel(labels,topLevel);
        if (secondLevel.labelIndex!=0 && topLevel.recognized) {
            modifyName = secondLevel.name +"."+ topLevel.name;
        }
    }

    DomainParser.prototype.getModifyName = function() {
        return modifyName;
    }

    function hasError() {
        return b_error;
    }

    DomainParser.prototype.hasError = hasError;

    DomainParser.prototype.getMessage = function() {
        if (hasError()) {
            return message;
        }
        else {
            return null;
        }
    }

    function parseLabels() {
        var labels = new Array();
        var offset = 0;
        while (offset< input.length) {
            var label = parseLabel();
            if (!hasError() && label) {
                labels.push(label);
            }
            else {
                return;
            }
        }
        return labels;

        function parseLabel() {
            var labelArr = new Array();
            var start = offset;
            while (offset < input.length) {
                var ch = input.charAt(offset);
                var invalid = false;
                if (start==offset && !isLetterOrDigit(ch)) {
                    invalid = true;
                }
                else if ((offset+1==input.length || input.charAt(offset+1)=='.') && !isLetterOrDigit(ch)) {
                    invalid = true;
                }
                else if (!isLabelChar(ch)){
                    invalid = true;
                }
                if (invalid) {
                    failMessage('格式错误。域名一般由英文字母、汉字、阿拉伯数字、"-"组成，用“.”分隔，且每段不能以“.”、"-”开头和结尾');
                    return;
                }
                else {
                    labelArr.push(ch);
                    offset++;
                    if ((offset<input.length && input.charAt(offset)=='.') || (offset==input.length)) {
                        if (offset<input.length && input.charAt(offset)=='.') {
                            offset++;
                        }
                        if (labelArr.length>63) {
                            failMessage('域名过长。每标号不得超过63个字符。由多个标号组成的完整域名总共不超过255个字符。');
                            return;
                        }
                        return labelArr.join("");
                    }

                }
            }
        }
    }

    function isLabelChar(ch) {
        if (ch.charCodeAt(0)<=127) {
            if(　(ch>='A'&&ch<='Z')||(ch>='a'&&ch<='z') || (ch>='0'&&ch<='9') || (ch=='-') ) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            if ((ch.charCodeAt(0)>=0xFF00 && ch.charCodeAt(0)<=0xFFEF) ||
                (ch.charCodeAt(0)>=0x3000 && ch.charCodeAt(0)<=0x303F)
            ) {
                return false;
            }
            else {
                return true;
            }
        }
    }

    function isLetterOrDigit(ch) {
        if (ch.charCodeAt(0)<=127) {
            if((ch>='A'&&ch<='Z')||(ch>='a'&&ch<='z') || (ch>='0'&&ch<='9')) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            if ((ch.charCodeAt(0)>=0xFF00 && ch.charCodeAt(0)<=0xFFEF) ||
                (ch.charCodeAt(0)>=0x3000 && ch.charCodeAt(0)<=0x303F)
                ) {
                return　false;
            }
            else {
                return true;
            }
        }
    }

    function isDigitLabels(label) {
        var i = 0;
        while (i<label.length) {
            var ch = label.charAt(i);
            if (!(ch>='0'&& ch<='9')) {
                return false;
            }
            i++;
        }
        return true;
    }

    function parseTopLevel(labels) {
        var topLevelName = "";
        var lowTopLevelName = "";
        var topLevel;
        var index;
        if (labels.length>=2) {
            topLevelName = labels[labels.length-2]+"."+labels[labels.length-1];
            lowTopLevelName = topLevelName.toLowerCase();
            for (index=0;index<tow_top_level.length;index++) {
                if (lowTopLevelName==tow_top_level[index]) {
                    topLevel = new TopLevel(topLevelName,2,labels.length-2,true);
                    break;
                }
            }
        }
        if (!topLevel) {
            topLevelName = labels[labels.length-1];
            lowTopLevelName = topLevelName.toLowerCase();
            for (index=0;index<one_top_level.length;index++) {
                if (lowTopLevelName==one_top_level[index]) {
                    topLevel = new TopLevel(topLevelName,1,labels.length-1,true);
                    break;
                }
            }
        }
        if (!topLevel) {
            topLevelName = labels[labels.length-1];
            topLevel = new TopLevel(topLevelName,1,labels.length-1,false);
        }
        return topLevel;
    }
    function TopLevel(name,labelCount,labelIndex,recognized) {
        this.name = name;
        this.labelCount= labelCount;
        this.labelIndex= labelIndex;
        this.recognized = recognized;
        return this;
    }

    function parseSecondLevel(labels,topLevel) {
        var secondLevel = new SecondLevel(labels[topLevel.labelIndex-1],1,topLevel.labelIndex-1);
        return secondLevel;
    }

    function SecondLevel(name,labelCount,labelIndex) {
        this.name = name;
        this.labelCount=labelCount;
        this.labelIndex = labelIndex;
        return this;
    }

    function failMessage(msg) {
        message = msg;
        b_error = true;
    }

    // 摘自文件 tld-list-basic.json => https://zh-hans.tld-list.com/%E5%85%8D%E8%B4%B9%E4%B8%8B%E8%BD%BD
    var one_top_level = ["aaa","aarp","abarth","abb","abbott","abbvie","abc","able","abogado","abudhabi","ac","academy","accenture","accountant","accountants","aco","active","actor","ad","adac","ads","adult","ae","aeg","aero","aetna","af","afamilycompany","afl","africa","ag","agakhan","agency","ai","aig","aigo","airbus","airforce","airtel","akdn","al","alfaromeo","alibaba","alipay","allfinanz","allstate","ally","alsace","alstom","am","amazon","americanexpress","americanfamily","amex","amfam","amica","amsterdam","an","analytics","android","anquan","anz","ao","aol","apartments","app","apple","aq","aquarelle","ar","arab","aramco","archi","army","arpa","art","arte","as","asda","asia","associates","at","athleta","attorney","au","auction","audi","audible","audio","auspost","author","auto","autos","avianca","aw","aws","ax","axa","az","azure","ba","baby","baidu","banamex","bananarepublic","band","bank","bar","barcelona","barclaycard","barclays","barefoot","bargains","baseball","basketball","bauhaus","bayern","bb","bbc","bbt","bbva","bcg","bcn","bd","be","beats","beauty","beer","bentley","berlin","best","bestbuy","bet","bf","bg","bh","bharti","bi","bible","bid","bike","bing","bingo","bio","biz","bj","bl","black","blackfriday","blanco","blockbuster","blog","bloomberg","blue","bm","bms","bmw","bn","bnl","bnpparibas","bo","boats","boehringer","bofa","bom","bond","boo","book","booking","boots","bosch","bostik","boston","bot","boutique","box","bq","br","bradesco","bridgestone","broadway","broker","brother","brussels","bs","bt","budapest","bugatti","build","builders","business","buy","buzz","bv","bw","by","bz","bzh","ca","cab","cafe","cal","call","calvinklein","cam","camera","camp","cancerresearch","canon","capetown","capital","capitalone","car","caravan","cards","care","career","careers","cars","cartier","casa","case","caseih","cash","casino","cat","catering","catholic","cba","cbn","cbre","cbs","cc","cd","ceb","center","ceo","cern","cf","cfa","cfd","cg","ch","chanel","channel","charity","chase","chat","cheap","chintai","chloe","christmas","chrome","chrysler","church","ci","cipriani","circle","cisco","citadel","citi","citic","city","cityeats","ck","cl","claims","cleaning","click","clinic","clinique","clothing","cloud","club","clubmed","cm","cn","co","coach","codes","coffee","college","cologne","com","comcast","commbank","community","company","compare","computer","comsec","condos","construction","consulting","contact","contractors","cooking","cookingchannel","cool","coop","corsica","country","coupon","coupons","courses","cpa","cr","credit","creditcard","creditunion","cricket","crown","crs","cruise","cruises","csc","cu","cuisinella","cv","cw","cx","cy","cymru","cyou","cz","dabur","dad","dance","data","date","dating","datsun","day","dclk","dds","de","deal","dealer","deals","degree","delivery","dell","deloitte","delta","democrat","dental","dentist","desi","design","dev","dhl","diamonds","diet","digital","direct","directory","discount","discover","dish","diy","dj","dk","dm","dnp","do","docs","doctor","dodge","dog","doha","domains","doosan","dot","download","drive","dtv","dubai","duck","dunlop","duns","dupont","durban","dvag","dvr","dz","earth","eat","ec","eco","edeka","edu","education","ee","eg","eh","email","emerck","energy","engineer","engineering","enterprises","epost","epson","equipment","er","ericsson","erni","es","esq","estate","esurance","et","etisalat","eu","eurovision","eus","events","everbank","exchange","expert","exposed","express","extraspace","fage","fail","fairwinds","faith","family","fan","fans","farm","farmers","fashion","fast","fedex","feedback","ferrari","ferrero","fi","fiat","fidelity","fido","film","final","finance","financial","fire","firestone","firmdale","fish","fishing","fit","fitness","fj","fk","flickr","flights","flir","florist","flowers","flsmidth","fly","fm","fo","foo","food","foodnetwork","football","ford","forex","forsale","forum","foundation","fox","fr","free","fresenius","frl","frogans","frontdoor","frontier","ftr","fujitsu","fujixerox","fun","fund","furniture","futbol","fyi","ga","gal","gallery","gallo","gallup","game","games","gap","garden","gay","gb","gbiz","gd","gdn","ge","gea","gent","genting","george","gf","gg","ggee","gh","gi","gift","gifts","gives","giving","gl","glade","glass","gle","global","globo","gm","gmail","gmbh","gmo","gmx","gn","godaddy","gold","goldpoint","golf","goo","goodhands","goodyear","goog","google","gop","got","gov","gp","gq","gr","grainger","graphics","gratis","green","gripe","grocery","group","gs","gt","gu","guardian","gucci","guge","guide","guitars","guru","gw","gy","hair","hamburg","hangout","haus","hbo","hdfc","hdfcbank","health","healthcare","help","helsinki","here","hermes","hgtv","hiphop","hisamitsu","hitachi","hiv","hk","hkt","hm","hn","hockey","holdings","holiday","homedepot","homegoods","homes","homesense","honda","honeywell","horse","hospital","host","hosting","hot","hoteles","hotels","hotmail","house","how","hr","hsbc","ht","htc","hu","hughes","hyatt","hyundai","ibm","icbc","ice","icu","id","ie","ieee","ifm","iinet","ikano","il","im","imamat","imdb","immo","immobilien","in","inc","industries","infiniti","info","ing","ink","institute","insurance","insure","int","intel","international","intuit","investments","io","ipiranga","iq","ir","irish","is","iselect","ismaili","ist","istanbul","it","itau","itv","iveco","iwc","jaguar","java","jcb","jcp","je","jeep","jetzt","jewelry","jio","jlc","jll","jm","jmp","jnj","jo","jobs","joburg","jot","joy","jp","jpmorgan","jprs","juegos","juniper","kaufen","kddi","ke","kerryhotels","kerrylogistics","kerryproperties","kfh","kg","kh","ki","kia","kids","kim","kinder","kindle","kitchen","kiwi","km","kn","koeln","komatsu","kosher","kp","kpmg","kpn","kr","krd","kred","kuokgroup","kw","ky","kyoto","kz","la","lacaixa","ladbrokes","lamborghini","lamer","lancaster","lancia","lancome","land","landrover","lanxess","lasalle","lat","latino","latrobe","law","lawyer","lb","lc","lds","lease","leclerc","lefrak","legal","lego","lexus","lgbt","li","liaison","lidl","life","lifeinsurance","lifestyle","lighting","like","lilly","limited","limo","lincoln","linde","link","lipsy","live","living","lixil","lk","llc","llp","loan","loans","locker","locus","loft","lol","london","lotte","lotto","love","lpl","lplfinancial","lr","ls","lt","ltd","ltda","lu","lundbeck","lupin","luxe","luxury","lv","ly","ma","macys","madrid","maif","maison","makeup","man","management","mango","map","market","marketing","markets","marriott","marshalls","maserati","mattel","mba","mc","mcd","mcdonalds","mckinsey","md","me","med","media","meet","melbourne","meme","memorial","men","menu","meo","merckmsd","metlife","mf","mg","mh","miami","microsoft","mil","mini","mint","mit","mitsubishi","mk","ml","mlb","mls","mm","mma","mn","mo","mobi","mobile","mobily","moda","moe","moi","mom","monash","money","monster","montblanc","mopar","mormon","mortgage","moscow","moto","motorcycles","mov","movie","movistar","mp","mq","mr","ms","msd","mt","mtn","mtpc","mtr","mu","museum","music","mutual","mutuelle","mv","mw","mx","my","mz","na","nab","nadex","nagoya","name","nationwide","natura","navy","nba","nc","ne","nec","net","netbank","netflix","network","neustar","new","newholland","news","next","nextdirect","nexus","nf","nfl","ng","ngo","nhk","ni","nico","nike","nikon","ninja","nissan","nissay","nl","no","nokia","northwesternmutual","norton","now","nowruz","nowtv","np","nr","nra","nrw","ntt","nu","nyc","nz","obi","observer","off","office","okinawa","olayan","olayangroup","oldnavy","ollo","om","omega","one","ong","onl","online","onyourside","ooo","open","oracle","orange","org","organic","orientexpress","origins","osaka","otsuka","ott","ovh","pa","page","pamperedchef","panasonic","panerai","paris","pars","partners","parts","party","passagens","pay","pccw","pe","pet","pf","pfizer","pg","ph","pharmacy","phd","philips","phone","photo","photography","photos","physio","piaget","pics","pictet","pictures","pid","pin","ping","pink","pioneer","pizza","pk","pl","place","play","playstation","plumbing","plus","pm","pn","pnc","pohl","poker","politie","porn","post","pr","pramerica","praxi","press","prime","pro","prod","productions","prof","progressive","promo","properties","property","protection","pru","prudential","ps","pt","pub","pw","pwc","py","qa","qpon","quebec","quest","qvc","racing","radio","raid","re","read","realestate","realtor","realty","recipes","red","redstone","redumbrella","rehab","reise","reisen","reit","reliance","ren","rent","rentals","repair","report","republican","rest","restaurant","review","reviews","rexroth","rich","richardli","ricoh","rightathome","ril","rio","rip","rmit","ro","rocher","rocks","rodeo","rogers","room","rs","rsvp","ru","rugby","ruhr","run","rw","rwe","ryukyu","sa","saarland","safe","safety","sakura","sale","salon","samsclub","samsung","sandvik","sandvikcoromant","sanofi","sap","sapo","sarl","sas","save","saxo","sb","sbi","sbs","sc","sca","scb","schaeffler","schmidt","scholarships","school","schule","schwarz","science","scjohnson","scor","scot","sd","se","search","seat","secure","security","seek","select","sener","services","ses","seven","sew","sex","sexy","sfr","sg","sh","shangrila","sharp","shaw","shell","shia","shiksha","shoes","shop","shopping","shouji","show","showtime","shriram","si","silk","sina","singles","site","sj","sk","ski","skin","sky","skype","sl","sling","sm","smart","smile","sn","sncf","so","soccer","social","softbank","software","sohu","solar","solutions","song","sony","soy","spa","space","spiegel","sport","spot","spreadbetting","sr","srl","srt","ss","st","stada","staples","star","starhub","statebank","statefarm","statoil","stc","stcgroup","stockholm","storage","store","stream","studio","study","style","su","sucks","supplies","supply","support","surf","surgery","suzuki","sv","swatch","swiftcover","swiss","sx","sy","sydney","symantec","systems","sz","tab","taipei","talk","taobao","target","tatamotors","tatar","tattoo","tax","taxi","tc","tci","td","tdk","team","tech","technology","tel","telecity","telefonica","temasek","tennis","teva","tf","tg","th","thd","theater","theatre","tiaa","tickets","tienda","tiffany","tips","tires","tirol","tj","tjmaxx","tjx","tk","tkmaxx","tl","tm","tmall","tn","to","today","tokyo","tools","top","toray","toshiba","total","tours","town","toyota","toys","tp","tr","trade","trading","training","travel","travelchannel","travelers","travelersinsurance","trust","trv","tt","tube","tui","tunes","tushu","tv","tvs","tw","tz","ua","ubank","ubs","uconnect","ug","uk","um","unicom","university","uno","uol","ups","us","uy","uz","va","vacations","vana","vanguard","vc","ve","vegas","ventures","verisign","vermögensberater","vermögensberatung","versicherung","vet","vg","vi","viajes","video","vig","viking","villas","vin","vip","virgin","visa","vision","vista","vistaprint","viva","vivo","vlaanderen","vn","vodka","volkswagen","volvo","vote","voting","voto","voyage","vu","vuelos","wales","walmart","walter","wang","wanggou","warman","watch","watches","weather","weatherchannel","webcam","weber","website","wed","wedding","weibo","weir","wf","whoswho","wien","wiki","williamhill","win","windows","wine","winners","wme","wolterskluwer","woodside","work","works","world","wow","ws","wtc","wtf","xbox","xerox","xfinity","xihuan","xin","xperia","xxx","xyz","yachts","yahoo","yamaxun","yandex","ye","yodobashi","yoga","yokohama","you","youtube","yt","yun","za","zappos","zara","zero","zip","zippo","zm","zone","zuerich","zw","δοκιμή","ελ","ευ","бг","бел","дети","ею","испытание","католик","ком","мкд","мон","москва","онлайн","орг","рус","рф","сайт","срб","укр","қаз","հայ","טעסט","ישראל","קום","آزمایشی","إختبار","ابوظبي","اتصالات","ارامكو","الاردن","البحرين","الجزائر","السعودية","العليان","المغرب","امارات","ایران","بارت","بازار","بيتك","بھارت","تونس","سودان","سورية","شبكة","عراق","عرب","عمان","فلسطين","قطر","كاثوليك","كوم","مصر","مليسيا","موبايلي","موريتانيا","موقع","همراه","پاكستان","پاکستان","ڀارت","कॉम","नेट","परीक्षा","भारत","भारतम्","भारोत","संगठन","বাংলা","ভারত","ভাৰত","ਭਾਰਤ","ભારત","ଭାରତ","இந்தியா","இலங்கை","சிங்கப்பூர்","பரிட்சை","భారత్","ಭಾರತ","ഭാരതം","ලංකා","คอม","ไทย","ລາວ","გე","みんな","アマゾン","クラウド","グーグル","コム","ストア","セール","テスト","ファッション","ポイント","世界","中信","中国","中國","中文网","亚马逊","企业","佛山","信息","健康","八卦","公司","公益","台湾","台灣","商城","商店","商标","嘉里","嘉里大酒店","在线","大众汽车","大拿","天主教","娱乐","家電","工行","广东","微博","慈善","我爱你","手机","手表","招聘","政务","政府","新加坡","新闻","时尚","書籍","机构","测试","淡马锡","測試","游戏","澳門","点看","珠宝","移动","组织机构","网址","网店","网站","网络","联通","诺基亚","谷歌","购物","通販","集团","電訊盈科","飞利浦","食品","餐厅","香格里拉","香港","닷넷","닷컴","삼성","테스트","한국"];
    var tow_top_level = ['ac.cn','com.cn','edu.cn','gov.cn','mil.cn','net.cn','org.cn','bj.cn',
                        'sh.cn','tj.cn','cq.cn','he.cn','sx.cn','nm.cn','ln.cn','jl.cn',
                        'hl.cn','js.cn','zj.cn','ah.cn','fj.cn','jx.cn','sd.cn','ha.cn',
                        'hb.cn','hn.cn','gd.cn','gx.cn','hi.cn','sc.cn','gz.cn','yn.cn',
                        'xz.cn','sn.cn','gs.cn','qh.cn','nx.cn','xj.cn','tw.cn','hk.cn',
                        'mo.cn','com.af','net.af','org.af','com.ag','net.ag','org.ag','co.at',
                        'or.at','com.bi','edu.bi','info.bi','mo.bi','or.bi','org.bi','com.br',
                        'net.br','org.br','co.bz','com.bz','net.bz','org.bz','co.cm','com.cm',
                        'net.cm','com.co','net.co','nom.co','ar.com','br.com','cn.com','de.com',
                        'eu.com','gb.com','gr.com','hu.com','jpn.com','kr.com','no.com',
                        'ru.com','se.com','uk.com','us.com','za.com','com.de','co.dm','com.ec',
                        'fin.ec','info.ec','med.ec','net.ec','pro.ec','com.es','nom.es',
                        'org.es','co.gg','net.gg','org.gg','co.gl','com.gl','edu.gl','net.gl',
                        'org.gl','com.gr','co.gy','com.gy','net.gy','com.hk','edu.hk','gov.hk',
                        'idv.hk','net.hk','org.hk','com.hn','net.hn','org.hn','adult.ht','com.ht',
                        'info.ht','net.ht','org.ht','org.il','co.in','firm.in','gen.in','ind.in',
                        'net.in','org.in','bz.it','co.it','co.je','net.je','org.je','com.ki',
                        'net.ki','org.ki','co.kr','ne.kr','or.kr','pe.kr','re.kr','seoul.kr',
                        'com.lc','net.lc','org.lc','co.mg','com.mg','net.mg','org.mg','ac.mu',
                        'co.mu','com.mu','net.mu','org.mu','com.mx','gb.net','hu.net','jp.net',
                        'se.net','uk.net','com.nf','net.nf','org.nf','co.nl','net.nz','org.nz',
                        'ae.org','us.org','com.pe','net.pe','org.pe','com.ph','com.pk','net.pk',
                        'org.pk','biz.pl','com.pl','info.pl','net.pl','org.pl','waw.pl','aaa.pro',
                        'aca.pro','acct.pro','avocat.pro','bar.pro','cpa.pro','eng.pro','jur.pro',
                        'law.pro','med.pro','recht.pro','com.ps','net.ps','org.ps','com.pt','edu.pt',
                        'org.pt','com.ru','net.sb','org.sb','com.sc','net.sc','org.sc','com.sg',
                        'com.so','net.so','org.so','club.tw','com.tw','ebiz.tw','game.tw','idv.tw',
                        'org.tw','me.uk','org.uk','co.uz','com.uz','com.vc','net.vc','org.vc',
                        'ac.vn','biz.vn','com.vn','edu.vn','gov.vn','health.vn','info.vn','int.vn',
                        'name.vn','net.vn','org.vn','pro.vn'];
}

function __iisURL(domain) {

    // var domain ="你好.xn--1ck2e1b";
    domain = __toUnicode(domain);
    // console.log(String.fromCharCode(domain));
    var parser = new DomainParser(domain);
    //解析
    parser.parse();
    //判断是否正常
    if (parser.hasError()) {

        //错误信息
        // var msg = parser.getMessage();
        // console.log(msg);

        return false;
    }

    return true;
}