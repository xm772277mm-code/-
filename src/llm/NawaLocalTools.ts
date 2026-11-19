export interface LocalToolOutput {
  toolName:
    | "calculator_and_units"
    | "code_synthesizer"
    | "code_analyzer"
    | "text_processor"
    | "structured_drafter";
  titleAr: string;
  reply: string;
  suggestions: string[];
  topicTag: string;
}

function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/،/g, ",");
}

// ============================================================================
// 1. Advanced Calculator, Percentages, Bases, Statistics & Unit Converter
// ============================================================================

function evalMathExpression(rawExpr: string): number | null {
  const normalized = toWesternDigits(rawExpr)
    .replace(/[×✕]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/\*\*/g, "^")
    .replace(/جذر\s*(?:التربيعي\s*(?:ل|لـ)?\s*)?/g, "sqrt")
    .replace(/sqrt\s*(\d+(?:\.\d+)?)/gi, "sqrt($1)")
    .replace(/مليار/g, "* 1000000000")
    .replace(/مليون/g, "* 1000000")
    .replace(/ألف|الف/g, "* 1000")
    .trim();

  // Tokenize numbers, functions, parentheses, operators
  const tokenRegex = /(sqrt|abs|round|\d+(?:\.\d+)?|[+\-*/%^()])/gi;
  const rawTokens = normalized.match(tokenRegex);
  if (!rawTokens || rawTokens.length < 2) return null;

  // Verify the input didn't drop arbitrary gibberish between math symbols
  const hasOperatorOrFunc = rawTokens.some((t) =>
    /^(?:\+|-|\*|\/|%|\^|sqrt|abs|round)$/i.test(t)
  );
  if (!hasOperatorOrFunc) return null;

  let pos = 0;
  const peek = () => rawTokens[pos];
  const consume = () => rawTokens[pos++];

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) return NaN;

    if (tok === "+" || tok === "-") {
      consume();
      const val = parsePrimary();
      return tok === "-" ? -val : val;
    }
    if (/^(?:sqrt|abs|round)$/i.test(tok)) {
      const fn = consume().toLowerCase();
      if (peek() === "(") {
        consume();
        const inner = parseExpr();
        if (peek() === ")") consume();
        if (fn === "sqrt") return inner < 0 ? NaN : Math.sqrt(inner);
        if (fn === "abs") return Math.abs(inner);
        return Math.round(inner);
      }
      const val = parsePrimary();
      if (fn === "sqrt") return val < 0 ? NaN : Math.sqrt(val);
      if (fn === "abs") return Math.abs(val);
      return Math.round(val);
    }
    if (tok === "(") {
      consume();
      const inner = parseExpr();
      if (peek() === ")") consume();
      return inner;
    }
    if (/^\d+(?:\.\d+)?$/.test(tok)) {
      consume();
      return Number(tok);
    }
    return NaN;
  };

  const parsePower = (): number => {
    const base = parsePrimary();
    if (peek() === "^") {
      consume();
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  };

  const parseTerm = (): number => {
    let val = parsePower();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = consume();
      const rhs = parsePower();
      if (op === "*") val *= rhs;
      else if (op === "/") val = rhs === 0 ? NaN : val / rhs;
      else val = rhs === 0 ? NaN : val % rhs;
    }
    return val;
  };

  const parseExpr = (): number => {
    let val = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const rhs = parseTerm();
      val = op === "+" ? val + rhs : val - rhs;
    }
    return val;
  };

  const result = parseExpr();
  if (pos !== rawTokens.length || !Number.isFinite(result)) return null;
  return result;
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return Number(n.toFixed(6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function evaluateLocalCalculator(raw: string): LocalToolOutput | null {
  const clean = toWesternDigits(raw).trim();
  const lower = clean.toLowerCase();

  // 1) Discount or Increase/Tax percentage: "خصم 20% على 1500" or "زيادة 14% على 1000"
  const discountMatch = clean.match(
    /(خصم|تخفيض|discount)\s*(\d+(?:\.\d+)?)\s*(?:%|في المي[ةه]|بالمي[ةه])?\s*(?:على|من|on|of)?\s*(\d+(?:\.\d+)?)/i
  );
  if (discountMatch) {
    const pct = Number(discountMatch[2]);
    const base = Number(discountMatch[3]);
    const saved = (pct / 100) * base;
    const net = base - saved;
    return {
      toolName: "calculator_and_units",
      titleAr: "حساب الخصم والنسبة المئوية",
      topicTag: "math_logic_help",
      reply:
        `### نتيجة حساب الخصم (${pct}% من ${formatNum(base)})\n\n` +
        `| البند | القيمة |\n| --- | --- |\n` +
        `| السعر الأصلي | ${formatNum(base)} |\n` +
        `| قيمة الخصم (${pct}%) | -${formatNum(saved)} |\n` +
        `| **السعر النهائي بعد الخصم** | **${formatNum(net)}** |`,
      suggestions: [`زيادة 14% على ${Math.round(net)}`, "احسب (250 * 4) + 15% من 2000"],
    };
  }

  const taxMatch = clean.match(
    /(زيادة|ضريبة|ضريبه|إضافة|اضافة|tax|add)\s*(\d+(?:\.\d+)?)\s*(?:%|في المي[ةه]|بالمي[ةه])?\s*(?:على|إلى|الى|to|on)?\s*(\d+(?:\.\d+)?)/i
  );
  if (taxMatch) {
    const pct = Number(taxMatch[2]);
    const base = Number(taxMatch[3]);
    const added = (pct / 100) * base;
    const gross = base + added;
    return {
      toolName: "calculator_and_units",
      titleAr: "حساب الزيادة / الضريبة",
      topicTag: "math_logic_help",
      reply:
        `### نتيجة حساب الزيادة (${pct}% على ${formatNum(base)})\n\n` +
        `| البند | القيمة |\n| --- | --- |\n` +
        `| المبلغ الأساسي | ${formatNum(base)} |\n` +
        `| مقدار الزيادة (${pct}%) | +${formatNum(added)} |\n` +
        `| **الإجمالي النهائي** | **${formatNum(gross)}** |`,
      suggestions: [`خصم 15% على ${Math.round(gross)}`, "حول 4 GB إلى MB"],
    };
  }

  // 2) Ratio percentage: "كم نسبة 45 من 180"
  const ratioMatch = clean.match(/(?:كم\s+)?(?:نسبة|نسبه)\s+(\d+(?:\.\d+)?)\s+(?:من|الى|إلى|of)\s+(\d+(?:\.\d+)?)/i);
  if (ratioMatch) {
    const part = Number(ratioMatch[1]);
    const whole = Number(ratioMatch[2]);
    if (whole !== 0) {
      const pct = (part / whole) * 100;
      return {
        toolName: "calculator_and_units",
        titleAr: "حساب النسبة بين رقمين",
        topicTag: "math_logic_help",
        reply: `يمثّل العدد **${formatNum(part)}** نسبة **${formatNum(pct)}%** من أصل **${formatNum(whole)}**.`,
        suggestions: ["احسب 25% من 4800", "خصم 20% على 1200"],
      };
    }
  }

  // 3) Inline percentage expansion inside arithmetic e.g. "(250 * 4) + 15% من 2000" or "20% من 1500"
  const pctReplaced = clean.replace(
    /(\d+(?:\.\d+)?)\s*(?:%|في المي[ةه]|بالمي[ةه])\s*(?:من|of)\s*(\d+(?:\.\d+)?)/gi,
    (_m, p, t) => `((${p}/100)*${t})`
  );

  // 4) Number base conversion: binary / hex / decimal
  const hexInput = clean.match(/0x([0-9a-f]+)/i);
  if (hexInput && /(حول|convert|عشري|decimal|باينري|ثنائي|binary|هيكسا|hex)/i.test(lower)) {
    const dec = parseInt(hexInput[1], 16);
    return {
      toolName: "calculator_and_units",
      titleAr: "تحويل أنظمة العد",
      topicTag: "math_logic_help",
      reply:
        `### تحويل القيمة \`0x${hexInput[1].toUpperCase()}\`\n\n` +
        `- **العشري (Decimal):** \`${dec.toLocaleString("en-US")}\`\n` +
        `- **الثنائي (Binary):** \`0b${dec.toString(2)}\`\n` +
        `- **السداسي عشر (Hex):** \`0x${dec.toString(16).toUpperCase()}\``,
      suggestions: ["حول 255 لباينري", "حول 4 GB إلى MB"],
    };
  }

  const decToBaseMatch = clean.match(
    /(?:حول|تحويل|convert)\s+(\d+)\s+(?:إلى|الى|لـ|ل|to)\s*(باينري|ثنائي|binary|هيكسا|سداسي عشر|hex|ثامني|octal)/i
  );
  if (decToBaseMatch) {
    const dec = parseInt(decToBaseMatch[1], 10);
    if (Number.isSafeInteger(dec) && dec >= 0) {
      return {
        toolName: "calculator_and_units",
        titleAr: "تحويل أنظمة العد",
        topicTag: "math_logic_help",
        reply:
          `### تحويل العدد العشري \`${dec}\`\n\n` +
          `| النظام | القيمة |\n| --- | --- |\n` +
          `| الثنائي (Binary) | \`0b${dec.toString(2)}\` |\n` +
          `| السداسي عشر (Hex) | \`0x${dec.toString(16).toUpperCase()}\` |\n` +
          `| الثماني (Octal) | \`0o${dec.toString(8)}\` |`,
        suggestions: ["حول 0xFF لعشري", "احسب جذر(144) + 2^8"],
      };
    }
  }

  // 5) Unit Conversions (Data storage, Time, Length, Weight, Temperature)
  const unitConvMatch = clean.match(
    /(?:حول|تحويل|كم|بكام|convert)?\s*(-?\d+(?:\.\d+)?)\s*(bit|bytes?|بايت|kb|كيلوبايت|mb|ميجا(?:بايت)?|gb|جيجا(?:بايت)?|tb|تيرا(?:بايت)?|ms|مللي|sec|s|ثاني[ةه]|ثواني|min|دقيق[ةه]|دقائق|hr|hours?|ساع[ةه]|ساعات|day|يوم|أيام|ايام|week|اسبوع|أسبوع|mm|cm|m|km|متر|كيلومتر|كم|سم|inch|mile|g|kg|جرام|كيلوجرام|كيلو|ton|طن|lb|°?c|°?f|°?k|مئوي|سيليزيوس|فهرنهايت|كلفن)\s+(?:إلى|الى|لـ|ل|فيها|كام|كم|to|in)\s*(bit|bytes?|بايت|kb|كيلوبايت|mb|ميجا(?:بايت)?|gb|جيجا(?:بايت)?|tb|تيرا(?:بايت)?|ms|مللي|sec|s|ثاني[ةه]|ثواني|min|دقيق[ةه]|دقائق|hr|hours?|ساع[ةه]|ساعات|day|يوم|أيام|ايام|week|اسبوع|أسبوع|mm|cm|m|km|متر|كيلومتر|كم|سم|inch|mile|g|kg|جرام|كيلوجرام|كيلو|ton|طن|lb|°?c|°?f|°?k|مئوي|سيليزيوس|فهرنهايت|كلفن)/i
  );
  if (unitConvMatch) {
    const val = Number(unitConvMatch[1]);
    const fromRaw = unitConvMatch[2].toLowerCase().replace("°", "");
    const toRaw = unitConvMatch[3].toLowerCase().replace("°", "");

    const mapUnit = (u: string): { group: string; factor: number; label: string } | null => {
      // Data (base = byte)
      if (/^(bit)$/.test(u)) return { group: "data", factor: 1 / 8, label: "Bit" };
      if (/^(bytes?|بايت)$/.test(u)) return { group: "data", factor: 1, label: "Byte" };
      if (/^(kb|كيلوبايت)$/.test(u)) return { group: "data", factor: 1024, label: "KB" };
      if (/^(mb|ميجا|ميجابايت)$/.test(u)) return { group: "data", factor: 1024 ** 2, label: "MB" };
      if (/^(gb|جيجا|جيجابايت)$/.test(u)) return { group: "data", factor: 1024 ** 3, label: "GB" };
      if (/^(tb|تيرا|تيرابايت)$/.test(u)) return { group: "data", factor: 1024 ** 4, label: "TB" };
      // Time (base = second)
      if (/^(ms|مللي)$/.test(u)) return { group: "time", factor: 0.001, label: "مللي ثانية (ms)" };
      if (/^(s|sec|ثانية|ثانيه|ثواني)$/.test(u)) return { group: "time", factor: 1, label: "ثانية" };
      if (/^(min|دقيقة|دقيقه|دقائق)$/.test(u)) return { group: "time", factor: 60, label: "دقيقة" };
      if (/^(hr|hours?|ساعة|ساعه|ساعات)$/.test(u)) return { group: "time", factor: 3600, label: "ساعة" };
      if (/^(day|يوم|أيام|ايام)$/.test(u)) return { group: "time", factor: 86400, label: "يوم" };
      if (/^(week|اسبوع|أسبوع)$/.test(u)) return { group: "time", factor: 604800, label: "أسبوع" };
      // Length (base = meter)
      if (/^(mm)$/.test(u)) return { group: "len", factor: 0.001, label: "mm" };
      if (/^(cm|سم)$/.test(u)) return { group: "len", factor: 0.01, label: "cm" };
      if (/^(m|متر)$/.test(u)) return { group: "len", factor: 1, label: "متر (m)" };
      if (/^(km|كيلومتر|كم)$/.test(u)) return { group: "len", factor: 1000, label: "كيلومتر (km)" };
      if (/^(inch)$/.test(u)) return { group: "len", factor: 0.0254, label: "Inch" };
      if (/^(mile)$/.test(u)) return { group: "len", factor: 1609.344, label: "Mile" };
      // Weight (base = gram)
      if (/^(g|جرام)$/.test(u)) return { group: "weight", factor: 1, label: "جرام" };
      if (/^(kg|كيلوجرام|كيلو)$/.test(u)) return { group: "weight", factor: 1000, label: "كيلوجرام (kg)" };
      if (/^(ton|طن)$/.test(u)) return { group: "weight", factor: 1_000_000, label: "طن" };
      if (/^(lb)$/.test(u)) return { group: "weight", factor: 453.59237, label: "رطل (lb)" };
      // Temp
      if (/^(c|مئوي|سيليزيوس)$/.test(u)) return { group: "temp", factor: 1, label: "°C" };
      if (/^(f|فهرنهايت)$/.test(u)) return { group: "temp", factor: 2, label: "°F" };
      if (/^(k|كلفن)$/.test(u)) return { group: "temp", factor: 3, label: "K" };
      return null;
    };

    const uFrom = mapUnit(fromRaw);
    const uTo = mapUnit(toRaw);
    if (uFrom && uTo && uFrom.group === uTo.group) {
      if (uFrom.group === "temp") {
        let celsius = val;
        if (uFrom.label === "°F") celsius = ((val - 32) * 5) / 9;
        else if (uFrom.label === "K") celsius = val - 273.15;
        let out = celsius;
        if (uTo.label === "°F") out = (celsius * 9) / 5 + 32;
        else if (uTo.label === "K") out = celsius + 273.15;
        return {
          toolName: "calculator_and_units",
          titleAr: "محوّل درجات الحرارة",
          topicTag: "math_logic_help",
          reply: `**${formatNum(val)} ${uFrom.label}** تساوي **${formatNum(out)} ${uTo.label}**.`,
          suggestions: ["حول 100 F إلى C", "حول 4 GB إلى MB"],
        };
      }
      const out = (val * uFrom.factor) / uTo.factor;
      const extraNote =
        uFrom.group === "data"
          ? `\n\n*ملاحظة تقنية:* الحسبة القياسية أعلاه بنظام الذاكرة الثنائي (\`1024\`). بالنظام العشري للتخزين (\`1000\`) تساوي النتيجة **${formatNum(
              (val * (uFrom.label === "Bit" ? 0.125 : Math.pow(1000, ["Byte", "KB", "MB", "GB", "TB"].indexOf(uFrom.label)))) /
                (uTo.label === "Bit" ? 0.125 : Math.pow(1000, ["Byte", "KB", "MB", "GB", "TB"].indexOf(uTo.label)))
            )} ${uTo.label}**.`
          : "";
      return {
        toolName: "calculator_and_units",
        titleAr: "محوّل الوحدات الدقيق",
        topicTag: "math_logic_help",
        reply: `**${formatNum(val)} ${uFrom.label}** تساوي **${formatNum(out)} ${uTo.label}**.${extraNote}`,
        suggestions: ["حول 3 ساعات إلى ثانية", "حول 255 لباينري"],
      };
    }
  }

  // 6) Quick Statistics on a numeric list
  if (/(متوسط|مجموع|احصاء|إحصاء|average|sum|mean|median|max|min)/i.test(lower)) {
    const nums = (clean.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
    if (nums.length >= 3) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return {
        toolName: "calculator_and_units",
        titleAr: "تحليل إحصائي سريع للأرقام",
        topicTag: "math_logic_help",
        reply:
          `### الإحصائيات الدقيقة للقائمة (${nums.length} أرقام)\n\n` +
          `| المقياس | القيمة |\n| --- | --- |\n` +
          `| المجموع (Sum) | ${formatNum(sum)} |\n` +
          `| المتوسط الحسابي (Mean) | ${formatNum(avg)} |\n` +
          `| الوسيط (Median) | ${formatNum(median)} |\n` +
          `| الأصغر / الأكبر | ${formatNum(sorted[0])} / ${formatNum(sorted[sorted.length - 1])} |`,
        suggestions: ["احسب (250 * 4) + 15% من 2000", "خصم 25% على 1600"],
      };
    }
  }

  // 7) Direct arithmetic extraction with parentheses, powers, sqrt
  // Do not hijack budget/rule ratios (e.g., "قاعدة 50/30/20") or dates (2025/11/19) when user asks for an explanation
  const isConceptualSlashLabel =
    /\b\d+\/\d+\/\d+\b/.test(clean) &&
    !/(احسب|احسبلي|كم ناتج|ناتج|يساوي|compute|calculate|eval|=)/i.test(clean);

  if (!isConceptualSlashLabel) {
    const candidateExpr = pctReplaced
      .replace(/^(?:احسبلي|احسب|كم ناتج|ناتج|ما هو ناتج|يساوي كام|بكام|compute|calculate|eval)\s+/i, "")
      .replace(/[؟?=:]/g, "")
      .trim();

    const exprOnlyStripped = candidateExpr
      .replace(/(?:جذر|ألف|الف|مليون|مليار|sqrt|abs|round|[\d.+\-*/%^(),\s])/gi, "")
      .trim();

    const directComputed = exprOnlyStripped.length === 0 ? evalMathExpression(candidateExpr) : null;
    const exprSegment = candidateExpr.match(
      /(?:(?:sqrt|abs|round|جذر(?:\s*التربيعي\s*ل[ـ]?)?)\s*)?\(*\s*-?\d+(?:\.\d+)?(?:\s*(?:ألف|الف|مليون|مليار))?(?:\s*[+\-*/%^]\s*(?:(?:sqrt|abs|round|جذر(?:\s*التربيعي\s*ل[ـ]?)?)\s*)?\(*\s*-?\d+(?:\.\d+)?(?:\s*(?:ألف|الف|مليون|مليار))?\)*)+/i
    );

    const tryStr =
      directComputed !== null
        ? candidateExpr
        : exprSegment && exprSegment[0].length >= 3
          ? exprSegment[0]
          : "";
    const computed = directComputed !== null ? directComputed : tryStr ? evalMathExpression(tryStr) : null;
    if (computed !== null) {
      return {
        toolName: "calculator_and_units",
        titleAr: "وحدة الحساب الدقيقة",
        topicTag: "math_logic_help",
        reply: `ناتج العملية الحسابية \`${tryStr.trim()}\` هو **${formatNum(computed)}**.`,
        suggestions: ["خصم 20% على 1500", "حول 4 GB إلى MB"],
      };
    }
  }

  return null;
}

// ============================================================================
// 2. Local Code Synthesizer (Clean, Idiomatic, Multi-Language Templates)
// ============================================================================

export function synthesizeLocalCode(raw: string, normText: string): LocalToolOutput | null {
  const wantsCodeWrite =
    /(اكتب(?:لي)?\s+(?:لي\s+)?(?:دال[ةه]|كود|برنامج|سكربت|مكون|صفح[ةه]|استعلام|كلاس|ملف)|اعمل(?:لي)?\s+(?:كود|دال[ةه]|صفح[ةه]|تطبيق|جدول|api)|سوي(?:لي)?\s+(?:كود|دال[ةه]|api)|صمم(?:لي)?\s+(?:كود|واجهة|جدول|صفح[ةه])|write\s+(?:a\s+)?(?:function|code|script|query|component|api)|generate\s+(?:code|function|dockerfile|sql|regex))/i.test(
      raw
    ) ||
    (/(typescript|python|sql|react|html|docker|regex|bash|cpp|rust)/i.test(normText) &&
      /(ادارة المهام|task|debounce|binary search|بحث ثنائي|فرز|sort|validation|تحقق|fetch|retry|dockerfile|crud|جدول)/i.test(
        normText
      ));

  if (!wantsCodeWrite) return null;

  const isPython = /(python|بايثون|fastapi|flask)/i.test(normText);
  const isReact = /(react|رياكت|component|مكون|واجهة)/i.test(normText);
  const isSql = /(\bsql\b|sqlite|postgres|جدول|استعلام|قاعده|داتابيز)/i.test(normText);
  const isDocker = /(docker|dockerfile|حاوية|دوكر)/i.test(normText);
  const isHtml = /(\bhtml\b|\bcss\b|tailwind|صفحه ويب|صفحة)/i.test(normText);
  const isRegex = /(regex|تعبير نمطي|التحقق من البريد|التحقق من الايميل|رقم الهاتف)/i.test(normText);

  if (isDocker) {
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد Dockerfile إنتاجي",
      topicTag: "docker_k8s",
      reply:
        `### ملف Dockerfile متعدّد المراحل (Multi-Stage) جاهز للإنتاج\n\n` +
        "```dockerfile\n" +
        "# Stage 1: Build\n" +
        "FROM node:22-alpine AS builder\n" +
        "WORKDIR /app\n" +
        "COPY package*.json ./\n" +
        "RUN npm ci\n" +
        "COPY . .\n" +
        "RUN npm run build\n\n" +
        "# Stage 2: Minimal Production Runtime\n" +
        "FROM node:22-alpine AS runner\n" +
        "WORKDIR /app\n" +
        "ENV NODE_ENV=production PORT=3000\n" +
        "COPY --from=builder /app/package*.json ./\n" +
        "RUN npm ci --omit=dev\n" +
        "COPY --from=builder /app/dist ./dist\n" +
        "USER node\n" +
        "EXPOSE 3000\n" +
        'CMD ["node", "dist/server.js"]\n' +
        "```\n\n" +
        "**أهم المزايا المطبّقة:** تقليص حجم الصورة النهائية بفصل مرحلة البناء، وتشغيل الحاوية بصلاحيات `USER node` غير الجذرية.",
      suggestions: ["قارن بين Docker و Kubernetes", "كيف أحمي خادم Node.js من الثغرات؟"],
    };
  }

  if (isRegex) {
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد تعبيرات نمطية (Regex) ودوال تحقق",
      topicTag: "javascript_ts",
      reply:
        `### تعبيرات Regex ودوال تحقق جاهزة للاستخدام (TypeScript / JavaScript)\n\n` +
        "```ts\n" +
        "export const VALIDATORS = {\n" +
        "  email: /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/,\n" +
        "  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$/,\n" +
        "  arabicOnly: /^[\\u0600-\\u06FF\\s]+$/,\n" +
        "  urlHttps: /^https:\\/\\/[\\w.-]+(?:\\.[\\w.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]*$/,\n" +
        "};\n\n" +
        "export function validateUserInput(email: string, password: string) {\n" +
        "  return {\n" +
        "    emailValid: VALIDATORS.email.test(email.trim()),\n" +
        "    passwordStrong: VALIDATORS.strongPassword.test(password),\n" +
        "  };\n" +
        "}\n" +
        "```",
      suggestions: ["اكتب دالة Debounce بـ TypeScript", "ازاي احمي كلمات المرور والتوكنات"],
    };
  }

  if (isSql) {
    return {
      toolName: "code_synthesizer",
      titleAr: "تصميم جداول واستعلامات SQL محمية",
      topicTag: "postgresql",
      reply:
        `### مخطط SQL واستعلامات آمنة (SQLite / PostgreSQL)\n\n` +
        "```sql\n" +
        "CREATE TABLE IF NOT EXISTS tasks (\n" +
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
        "  title TEXT NOT NULL,\n" +
        "  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),\n" +
        "  completed INTEGER NOT NULL DEFAULT 0,\n" +
        "  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n" +
        ");\n\n" +
        "CREATE INDEX IF NOT EXISTS idx_tasks_priority_done ON tasks (priority, completed);\n\n" +
        "-- استعلام معلم (Parameterized) محمي من SQL Injection\n" +
        "SELECT id, title, priority, created_at\n" +
        "FROM tasks\n" +
        "WHERE completed = 0 AND priority = ?\n" +
        "ORDER BY created_at DESC\n" +
        "LIMIT 25;\n" +
        "```",
      suggestions: ["قارن بين SQLite و PostgreSQL", "اكتب دالة TypeScript لإدارة المهام"],
    };
  }

  if (/(debounce|تأخير|throttle)/i.test(normText)) {
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد دالة Debounce احترافية",
      topicTag: "javascript_ts",
      reply:
        `### دالة Debounce عامة مع دعم TypeScript وإلغاء التنفيذ المعلّق\n\n` +
        "```ts\n" +
        "export function debounce<T extends (...args: unknown[]) => void>(fn: T, waitMs = 250) {\n" +
        "  let timer: ReturnType<typeof setTimeout> | null = null;\n\n" +
        "  const debounced = (...args: Parameters<T>) => {\n" +
        "    if (timer) clearTimeout(timer);\n" +
        "    timer = setTimeout(() => {\n" +
        "      timer = null;\n" +
        "      fn(...args);\n" +
        "    }, waitMs);\n" +
        "  };\n\n" +
        "  debounced.cancel = () => {\n" +
        "    if (timer) {\n" +
        "      clearTimeout(timer);\n" +
        "      timer = null;\n" +
        "    }\n" +
        "  };\n\n" +
        "  return debounced;\n" +
        "}\n" +
        "```\n\n" +
        "**متى تستخدمها؟** لتقليل استدعاءات البحث الفوري أو حفظ النماذج أثناء الكتابة السريعة.",
      suggestions: ["اكتب دالة Fetch مع إعادة المحاولة", "مقارنة بين React و Vue أو TypeScript"],
    };
  }

  if (/(fetch|retry|محاوله|api\s*client|طلب)/i.test(normText)) {
    const code = isPython
      ? "```python\n" +
        "import time\n" +
        "import urllib.request\n\n" +
        "def fetch_with_retry(url: str, retries: int = 3, timeout: float = 5.0) -> str:\n" +
        "    for attempt in range(retries):\n" +
        "        try:\n" +
        "            with urllib.request.urlopen(url, timeout=timeout) as resp:\n" +
        "                return resp.read().decode('utf-8')\n" +
        "        except Exception:\n" +
        "            if attempt == retries - 1:\n" +
        "                raise\n" +
        "            time.sleep(0.5 * (2 ** attempt))\n" +
        "    raise RuntimeError('Unreachable')\n" +
        "```"
      : "```ts\n" +
        "export async function fetchWithRetry<T>(url: string, retries = 3, timeoutMs = 6000): Promise<T> {\n" +
        "  for (let attempt = 0; attempt < retries; attempt++) {\n" +
        "    const controller = new AbortController();\n" +
        "    const timer = setTimeout(() => controller.abort(), timeoutMs);\n" +
        "    try {\n" +
        "      const res = await fetch(url, { signal: controller.signal });\n" +
        "      if (!res.ok) throw new Error(`HTTP ${res.status}`);\n" +
        "      return (await res.json()) as T;\n" +
        "    } catch (err) {\n" +
        "      if (attempt === retries - 1) throw err;\n" +
        "      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));\n" +
        "    } finally {\n" +
        "      clearTimeout(timer);\n" +
        "    }\n" +
        "  }\n" +
        "  throw new Error('Request failed');\n" +
        "}\n" +
        "```";
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد عميل شبكي مع إعادة المحاولة",
      topicTag: isPython ? "python" : "javascript_ts",
      reply: `### دالة جلب بيانات مع مهلة زمنية وإعادة محاولة أسّية (Exponential Backoff)\n\n${code}`,
      suggestions: ["اكتب دالة Debounce بـ TypeScript", "الفرق بين REST و GraphQL"],
    };
  }

  if (/(فرز|sort|بحث ثنائي|binary search|اولي|prime)/i.test(normText)) {
    const code = isPython
      ? "```python\n" +
        "def binary_search(sorted_items: list[int], target: int) -> int:\n" +
        "    left, right = 0, len(sorted_items) - 1\n" +
        "    while left <= right:\n" +
        "        mid = (left + right) // 2\n" +
        "        if sorted_items[mid] == target:\n" +
        "            return mid\n" +
        "        if sorted_items[mid] < target:\n" +
        "            left = mid + 1\n" +
        "        else:\n" +
        "            right = mid - 1\n" +
        "    return -1\n" +
        "```"
      : "```ts\n" +
        "export function binarySearch<T>(sorted: readonly T[], target: T): number {\n" +
        "  let left = 0;\n" +
        "  let right = sorted.length - 1;\n" +
        "  while (left <= right) {\n" +
        "    const mid = (left + right) >>> 1;\n" +
        "    if (sorted[mid] === target) return mid;\n" +
        "    if (sorted[mid] < target) left = mid + 1;\n" +
        "    else right = mid - 1;\n" +
        "  }\n" +
        "  return -1;\n" +
        "}\n" +
        "```";
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد خوارزمية بحث ثنائي O(log N)",
      topicTag: "algorithms",
      reply:
        `### خوارزمية البحث الثنائي بتعقيد زمني \`O(log N)\` ومساحة \`O(1)\`\n\n${code}\n\n` +
        "**تنبيه مهم:** تشترط الخوارزمية أن تكون المصفوفة مرتبة تصاعدياً مسبقاً.",
      suggestions: ["اشرح الخوارزميات وهياكل البيانات", "اكتب دالة TypeScript لإدارة المهام"],
    };
  }

  if (isReact || /(مهام|task|todo|crud|اداره|تطبيق)/i.test(normText)) {
    if (isPython) {
      return {
        toolName: "code_synthesizer",
        titleAr: "توليد خدمة مهام بـ Python / FastAPI",
        topicTag: "python",
        reply:
          `### تطبيق Python منظم لإدارة المهام مع الأولوية والتحقق بالأنواع\n\n` +
          "```python\n" +
          "from dataclasses import dataclass, field\n" +
          "from typing import Literal\n\n" +
          "Priority = Literal['high', 'medium', 'low']\n" +
          "PRIORITY_ORDER = {'high': 0, 'medium': 1, 'low': 2}\n\n" +
          "@dataclass\n" +
          "class TaskItem:\n" +
          "    id: int\n" +
          "    title: str\n" +
          "    priority: Priority = 'medium'\n" +
          "    done: bool = False\n\n" +
          "@dataclass\n" +
          "class TaskBoard:\n" +
          "    tasks: list[TaskItem] = field(default_factory=list)\n" +
          "    _next_id: int = 1\n\n" +
          "    def add_task(self, title: str, priority: Priority = 'medium') -> TaskItem:\n" +
          "        clean = title.strip()\n" +
          "        if not clean:\n" +
          "            raise ValueError('عنوان المهمة لا يمكن أن يكون فارغاً')\n" +
          "        item = TaskItem(id=self._next_id, title=clean, priority=priority)\n" +
          "        self._next_id += 1\n" +
          "        self.tasks.append(item)\n" +
          "        return item\n\n" +
          "    def pending_sorted(self) -> list[TaskItem]:\n" +
          "        return sorted(\n" +
          "            (t for t in self.tasks if not t.done),\n" +
          "            key=lambda t: PRIORITY_ORDER[t.priority],\n" +
          "        )\n" +
          "```",
        suggestions: ["اكتب نفس نظام المهام بـ TypeScript", "صمّم جدول SQL للمهام"],
      };
    }

    if (isReact) {
      return {
        toolName: "code_synthesizer",
        titleAr: "توليد مكون React لإدارة المهام",
        topicTag: "react",
        reply:
          `### مكون React (TSX) متكامل لإدارة المهام مع تصفية الأولوية\n\n` +
          "```tsx\n" +
          "import React, { useMemo, useState } from 'react';\n\n" +
          "type Priority = 'high' | 'medium' | 'low';\n" +
          "interface Task { id: number; title: string; priority: Priority; done: boolean; }\n\n" +
          "export function TaskManager() {\n" +
          "  const [tasks, setTasks] = useState<Task[]>([]);\n" +
          "  const [title, setTitle] = useState('');\n" +
          "  const [priority, setPriority] = useState<Priority>('medium');\n\n" +
          "  const addTask = (e: React.FormEvent) => {\n" +
          "    e.preventDefault();\n" +
          "    if (!title.trim()) return;\n" +
          "    setTasks((prev) => [...prev, { id: Date.now(), title: title.trim(), priority, done: false }]);\n" +
          "    setTitle('');\n" +
          "  };\n\n" +
          "  const remaining = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);\n\n" +
          "  return (\n" +
          "    <section className='space-y-4'>\n" +
          "      <form onSubmit={addTask} className='flex gap-2'>\n" +
          "        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='أضف مهمة...' />\n" +
          "        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>\n" +
          "          <option value='high'>عالية</option>\n" +
          "          <option value='medium'>متوسطة</option>\n" +
          "          <option value='low'>منخفضة</option>\n" +
          "        </select>\n" +
          "        <button type='submit'>إضافة ({remaining})</button>\n" +
          "      </form>\n" +
          "    </section>\n" +
          "  );\n" +
          "}\n" +
          "```",
        suggestions: ["ما هي أفضل ممارسات أداء React؟", "اكتب جدول SQL للمهام"],
      };
    }

    return {
      toolName: "code_synthesizer",
      titleAr: "توليد وحدة TypeScript ذكية لإدارة المهام",
      topicTag: "javascript_ts",
      reply:
        `### وحدة TypeScript متكاملة لإدارة المهام مع الأولوية والبحث\n\n` +
        "```ts\n" +
        "export type TaskPriority = 'high' | 'medium' | 'low';\n\n" +
        "export interface TaskItem {\n" +
        "  id: string;\n" +
        "  title: string;\n" +
        "  priority: TaskPriority;\n" +
        "  completed: boolean;\n" +
        "  createdAt: number;\n" +
        "}\n\n" +
        "const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };\n\n" +
        "export class SmartTaskStore {\n" +
        "  private items = new Map<string, TaskItem>();\n\n" +
        "  add(title: string, priority: TaskPriority = 'medium'): TaskItem {\n" +
        "    const clean = title.trim();\n" +
        "    if (!clean) throw new Error('عنوان المهمة مطلوب');\n" +
        "    const task: TaskItem = {\n" +
        "      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,\n" +
        "      title: clean,\n" +
        "      priority,\n" +
        "      completed: false,\n" +
        "      createdAt: Date.now(),\n" +
        "    };\n" +
        "    this.items.set(task.id, task);\n" +
        "    return task;\n" +
        "  }\n\n" +
        "  toggle(id: string): TaskItem | null {\n" +
        "    const existing = this.items.get(id);\n" +
        "    if (!existing) return null;\n" +
        "    const updated = { ...existing, completed: !existing.completed };\n" +
        "    this.items.set(id, updated);\n" +
        "    return updated;\n" +
        "  }\n\n" +
        "  listPending(): TaskItem[] {\n" +
        "    return Array.from(this.items.values())\n" +
        "      .filter((t) => !t.completed)\n" +
        "      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt);\n" +
        "  }\n" +
        "}\n" +
        "```\n\n" +
        "**لماذا استخدمنا `Map`؟** للوصول والتعديل بزمن ثابت `O(1)` عبر المعرّف مع ترتيب المهام المعلّقة تلقائياً حسب الأولوية.",
      suggestions: ["اكتب جدول SQL للمهام", "اكتب مكون React للواجهة"],
    };
  }

  if (isHtml) {
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد هيكل HTML/CSS متجاوب",
      topicTag: "html_css_web",
      reply:
        `### صفحة HTML متجاوبة تدعم العربية (RTL) وتنسيق Grid\n\n` +
        "```html\n" +
        "<!doctype html>\n" +
        "<html lang=\"ar\" dir=\"rtl\">\n" +
        "<head>\n" +
        "  <meta charset=\"UTF-8\" />\n" +
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n" +
        "  <title>لوحة الأعمال</title>\n" +
        "  <style>\n" +
        "    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }\n" +
        "    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }\n" +
        "    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }\n" +
        "  </style>\n" +
        "</head>\n" +
        "<body>\n" +
        "  <main class=\"grid\">\n" +
        "    <article class=\"card\"><h2>المهام النشطة</h2><p>تحديث فوري ومنظم.</p></article>\n" +
        "    <article class=\"card\"><h2>التقارير</h2><p>ملخص الأداء اليومي.</p></article>\n" +
        "  </main>\n" +
        "</body>\n" +
        "</html>\n" +
        "```",
      suggestions: ["اكتب دالة Debounce بـ TypeScript", "كيف أحسّن أداء تطبيقات الويب؟"],
    };
  }

  // Generic clean function template tailored to detected language
  if (isPython) {
    return {
      toolName: "code_synthesizer",
      titleAr: "توليد قالب دالة Python منضبطة",
      topicTag: "python",
      reply:
        `### قالب دالة Python نظيفة مع Type Hints ومعالجة الأخطاء\n\n` +
        "```python\n" +
        "from typing import Iterable\n\n" +
        "def process_records(records: Iterable[dict], min_value: float = 0.0) -> list[dict]:\n" +
        "    results: list[dict] = []\n" +
        "    for item in records:\n" +
        "        try:\n" +
        "            score = float(item.get('value', 0))\n" +
        "            if score >= min_value:\n" +
        "                results.append({**item, 'value': score})\n" +
        "        except (TypeError, ValueError):\n" +
        "            continue\n" +
        "    return results\n" +
        "```",
      suggestions: ["اكتب خوارزمية البحث الثنائي بـ Python", "قارن بين Python و Rust"],
    };
  }

  return {
    toolName: "code_synthesizer",
    titleAr: "توليد قالب دالة TypeScript",
    topicTag: "javascript_ts",
    reply:
      `### دالة TypeScript نظيفة مع التحقق الصارم من المدخلات\n\n` +
      "```ts\n" +
      "export interface RecordItem {\n" +
      "  id: string;\n" +
      "  label: string;\n" +
      "  value: number;\n" +
      "}\n\n" +
      "export function filterAndSort(items: readonly RecordItem[], minValue = 0): RecordItem[] {\n" +
      "  return items\n" +
      "    .filter((item) => Number.isFinite(item.value) && item.value >= minValue)\n" +
      "    .sort((a, b) => b.value - a.value);\n" +
      "}\n" +
      "```",
    suggestions: ["اكتب دالة TypeScript لإدارة المهام", "اكتب دالة Fetch مع إعادة المحاولة"],
  };
}

// ============================================================================
// 3. Deep Static Code Auditor
// ============================================================================

export function analyzeCodeSnippetDetailed(raw: string): string | null {
  const hasCode =
    /(?:def\s+\w+|function\s+\w+|async\s+function|const\s+\w+\s*=|let\s+\w+\s*=|class\s+\w+|SELECT\s+.+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|for\s*\(|for\s+\w+\s+in\s+|fn\s+\w+|#include\s*<|FROM\s+\w+:\w+)/i.test(
      raw
    );
  if (!hasCode) return null;

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const findings: string[] = [];

  if (/def\s+\w+/.test(raw)) findings.push("**اللغة المرصودة:** Python.");
  else if (/fn\s+\w+|let\s+mut\s+/.test(raw)) findings.push("**اللغة المرصودة:** Rust.");
  else if (/#include\s*</.test(raw)) findings.push("**اللغة المرصودة:** C / C++.");
  else if (/SELECT\s+.+FROM|CREATE\s+TABLE/i.test(raw)) findings.push("**اللغة المرصودة:** SQL.");
  else if (/function\s+\w+|const\s+\w+\s*=|=>/.test(raw)) findings.push("**اللغة المرصودة:** JavaScript / TypeScript.");

  if (/async\s+|await\s+/.test(raw)) {
    findings.push("**التزامن:** يستخدم `async/await` لتفادي حجب الخيط الرئيسي.");
  }

  if (/SELECT\s+.+FROM|INSERT\s+INTO|UPDATE\s+\w+/i.test(raw)) {
    if (/\+|\bf"|f'|%\s*\(|\$\{/.test(raw)) {
      findings.push("**تحذير أمان حرج (SQL Injection):** يظهر دمج مباشر للمتغيرات داخل نص الاستعلام؛ استخدم المعاملات المقيدة (`?` أو `$1`).");
    } else {
      findings.push("**فحص SQL:** البنية تبدو خالية من دمج النصوص المباشر.");
    }
  }

  if (/innerHTML\s*=|dangerouslySetInnerHTML/.test(raw)) {
    findings.push("**تحذير XSS:** استخدام `innerHTML` قد يسمح بحقن سكربتات إذا كانت البيانات من المستخدم؛ استخدم `textContent` أو تعقيم المحتوى.");
  }

  if (/(?:api_key|secret|password|token)\s*[:=]\s*["'][^"']{6,}["']/i.test(raw)) {
    findings.push("**تحذير تسريب أسرار:** توجد قيمة سرية مكتوبة مباشرة في الكود؛ انقلها إلى متغيرات البيئة `.env` أو Secret Manager.");
  }

  if (/eval\(|exec\(/.test(raw)) {
    findings.push("**تحذير حرج:** استدعاء `eval/exec` يفتح ثغرة تنفيذ كود عشوائي؛ استبدله بمحلل بيانات مخصص.");
  }

  const loopCount = (raw.match(/\b(for|while)\b/g) || []).length;
  if (loopCount >= 2) {
    findings.push("**ملاحظة أداء:** رُصدت أكثر من حلقة تكرار؛ تحقق من إمكانية استبدال الحلقات المتداخلة `O(N²)` بـ `Map` أو `Set` للوصول `O(1)`.");
  }

  if (/\bvar\s+\w+/.test(raw)) {
    findings.push("**تحديث الصياغة:** استبدل `var` بـ `const` أو `let` لتفادي مشاكل نطاق المتغيرات.");
  }

  if (!/\b(try|except|catch|Result<)\b/.test(raw) && lines.length >= 4) {
    findings.push("**الموثوقية:** أضف `try/catch` أو `try/except` للتعامل الآمن مع الأخطاء غير المتوقعة.");
  }

  const fnCount = (raw.match(/\b(?:def|function|fn)\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(/g) || []).length;
  if (fnCount > 0) {
    findings.push(`**ملخص البنية:** ${lines.length} سطر فعلي · ${fnCount} دالة.`);
  }

  return (
    `### مراجعة وفحص الكود (${lines.length} سطر فعلي)\n\n` +
    findings.map((f) => `- ${f}`).join("\n") +
    "\n\nإذا أردت إعادة صياغة جزء محدد أو كتابة اختبارات له، أخبرني باسم الدالة أو اللغة."
  );
}

// ============================================================================
// 4. Deterministic Text Summarizer, Key-Point Extractor & List Processor
// ============================================================================

const ARABIC_STOP = new Set([
  "من", "في", "على", "عن", "إلى", "الى", "مع", "أو", "او", "و", "ثم", "لكن", "حتى",
  "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "ما", "ماذا", "كيف", "لماذا", "هل",
  "ان", "إن", "أن", "كان", "يكون", "بين", "كل", "بعض", "عن", "فقط", "قد", "لقد",
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "into",
]);

export function summarizeOrTransformText(raw: string): LocalToolOutput | null {
  const trimmed = raw.trim();
  const hasCountReq = /(عد الكلمات|كم عدد الكلمات|احسب الكلمات|احسب الحروف|word count)/i.test(trimmed);
  const hasSortReq = /(رتب القائمة|رتب الاسماء|رتب السطور|امسح المكرر|احذف المكرر|sort lines|deduplicate)/i.test(trimmed);
  const hasSummaryReq = /(لخص|تلخيص|استخرج النقاط|نقاط رئيسية|النقاط الرئيسية|اختصر النص|summarize|key points)/i.test(trimmed);

  if (!hasCountReq && !hasSortReq && !hasSummaryReq) return null;

  // Extract body after ':' or first newline if user prefaced with a command
  let body = trimmed;
  const colonIdx = trimmed.indexOf(":");
  const nlIdx = trimmed.indexOf("\n");
  if (colonIdx > 0 && colonIdx < 80) {
    body = trimmed.slice(colonIdx + 1).trim();
  } else if (nlIdx > 0 && nlIdx < 80) {
    body = trimmed.slice(nlIdx + 1).trim();
  } else {
    body = trimmed
      .replace(/^(?:لخص(?:لي)?|اختصر(?:لي)?|استخرج النقاط(?: الرئيسية)?(?: من)?|عد الكلمات(?: في)?|رتب القائمة)\s+(?:النص التالي|النص ده|المقال|التالي)?\s*/i, "")
      .trim();
  }

  if (hasSortReq) {
    const items = body
      .split(/[\n,،]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length >= 2) {
      const unique = Array.from(new Set(items)).sort((a, b) => a.localeCompare(b, "ar"));
      return {
        toolName: "text_processor",
        titleAr: "ترتيب وتنقية القائمة",
        topicTag: "text_tools",
        reply:
          `### القائمة بعد الترتيب وإزالة التكرار (${unique.length} عنصر من أصل ${items.length})\n\n` +
          unique.map((item, i) => `${i + 1}. ${item}`).join("\n"),
        suggestions: ["عد الكلمات في هذا النص", "لخص النص التالي: ..."],
      };
    }
  }

  if (hasCountReq && body.length > 0) {
    const words = body.split(/\s+/).filter(Boolean);
    const chars = body.length;
    const charsNoSpace = body.replace(/\s+/g, "").length;
    const sentences = body.split(/[.!؟?\n]+/).filter((s) => s.trim().length > 0).length;
    const readMin = Math.max(1, Math.ceil(words.length / 180));
    return {
      toolName: "text_processor",
      titleAr: "إحصاء وتحليل النص",
      topicTag: "text_tools",
      reply:
        `### إحصائيات النص الدقيقة\n\n` +
        `| المقياس | القيمة |\n| --- | --- |\n` +
        `| عدد الكلمات | ${words.length.toLocaleString("en-US")} |\n` +
        `| عدد الأحرف (بالمسافات) | ${chars.toLocaleString("en-US")} |\n` +
        `| عدد الأحرف (بدون مسافات) | ${charsNoSpace.toLocaleString("en-US")} |\n` +
        `| عدد الجمل | ${sentences.toLocaleString("en-US")} |\n` +
        `| وقت القراءة التقديري | ~${readMin} دقيقة |`,
      suggestions: ["رتب القائمة: ...", "اكتب إيميل رسمي لطلب اجتماع"],
    };
  }

  // Extractive TF-salience summarization when user provides real text (>= 110 chars and >= 2 sentences)
  if (hasSummaryReq && body.length >= 110) {
    const sentences = body
      .split(/(?<=[.!؟?\n])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12);

    if (sentences.length >= 2) {
      const freq = new Map<string, number>();
      const tokenize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 2 && !ARABIC_STOP.has(w));

      for (const s of sentences) {
        for (const w of tokenize(s)) {
          freq.set(w, (freq.get(w) || 0) + 1);
        }
      }

      const scored = sentences.map((s, idx) => {
        const toks = tokenize(s);
        const tfSum = toks.reduce((acc, w) => acc + (freq.get(w) || 0), 0);
        const normScore = toks.length > 0 ? tfSum / Math.sqrt(toks.length) : 0;
        const posBoost = idx === 0 ? 1.25 : idx === sentences.length - 1 ? 1.1 : 1.0;
        return { idx, text: s, score: normScore * posBoost };
      });

      const keepCount = Math.min(4, Math.max(2, Math.ceil(sentences.length * 0.45)));
      const topSelected = [...scored]
        .sort((a, b) => b.score - a.score)
        .slice(0, keepCount)
        .sort((a, b) => a.idx - b.idx);

      const totalWords = body.split(/\s+/).filter(Boolean).length;
      const summaryWords = topSelected.map((x) => x.text).join(" ").split(/\s+/).filter(Boolean).length;
      const ratioPct = totalWords > 0 ? Math.max(10, Math.round((1 - summaryWords / totalWords) * 100)) : 40;

      return {
        toolName: "text_processor",
        titleAr: "التلخيص الاستخراجي واستخراج النقاط",
        topicTag: "text_tools",
        reply:
          `### النقاط الرئيسية المستخلصة (ضغط ~${ratioPct}% من ${totalWords} كلمة)\n\n` +
          topSelected.map((s) => `- ${s.text}`).join("\n") +
          `\n\n**الخلاصة التنفيذية:** ${topSelected[0].text}`,
        suggestions: ["عد الكلمات في النص", "اكتب خطة عمل أسبوعية"],
      };
    }
  }

  return null;
}

// ============================================================================
// 5. Structured Arabic / English Drafting Templates
// ============================================================================

export function draftStructuredContent(raw: string, normText: string): LocalToolOutput | null {
  const isDraftAsk =
    /(اكتب(?:لي)?|صغ(?:لي)?|جهز(?:لي)?|اعمل(?:لي)?|سوي(?:لي)?|draft|template|plan)/i.test(raw);
  if (!isDraftAsk) return null;

  if (/(ايميل|إيميل|بريد الكتروني|رساله رسميه|رسالة رسمية|email)/i.test(normText)) {
    const isApology = /(اعتذار|تأخير|تاجيل|تأجيل)/i.test(normText);
    const isJob = /(تقديم|وظيفه|وظيفة|cv|سيره ذاتيه)/i.test(normText);

    if (isJob) {
      return {
        toolName: "structured_drafter",
        titleAr: "قالب بريد إلكتروني للتقديم على وظيفة",
        topicTag: "draft_email",
        reply:
          `### رسالة تقديم مهنية جاهزة للتعديل\n\n` +
          "**الموضوع:** طلب التقدّم لوظيفة [اسم الوظيفة] — [اسمك الكامل]\n\n" +
          "السلام عليكم ورحمة الله وبركاته،\n\n" +
          "السادة/ فريق التوظيف في [اسم الشركة] المحترمين،\n\n" +
          "أتقدّم إليكم بطلبي للانضمام إلى فريقكم في منصب **[اسم الوظيفة]**، حيث أمتلك خبرة عملية في **[أبرز مهارتين أو تقنيتين]**، وسبق لي تنفيذ مشاريع متكاملة حققت [إنجازاً محدداً أو تحسيناً في الأداء].\n\n" +
          "تجدون مرفقاً السيرة الذاتية وروابط أعمالي للاطلاع، ويسعدني مناقشة كيف يمكنني الإسهام في أهداف فريقكم خلال مقابلة في الوقت المناسب لكم.\n\n" +
          "وتفضلوا بقبول فائق الاحترام،\n**[اسمك الكامل]** · [رقم الهاتف] · [رابط LinkedIn / GitHub]",
        suggestions: ["نصائح لمقابلات البرمجة", "اكتب إيميل طلب اجتماع عمل"],
      };
    }

    if (isApology) {
      return {
        toolName: "structured_drafter",
        titleAr: "قالب بريد إلكتروني للاعتذار وتعديل الموعد",
        topicTag: "draft_email",
        reply:
          `### رسالة مهنية للاعتذار واقتراح موعد بديل\n\n` +
          "**الموضوع:** تحديث بخصوص موعد [اسم الاجتماع / التسليم]\n\n" +
          "تحية طيبة أستاذ/ة [الاسم]،\n\n" +
          "أعتذر عن أي إرباك، وأود إبلاغكم بضرورة تعديل موعد [الاجتماع / تسليم المهمة] المقرر يوم [اليوم] لظرف طارئ، مع التأكيد على التزامي الكامل بإنجازه بأعلى جودة.\n\n" +
          "هل يناسبكم الموعد البديل يوم **[اليوم المقترح]** الساعة **[الساعة]**؟\n\n" +
          "شاكر ومقدّر تفهمكم،\n**[اسمك]**",
        suggestions: ["اكتب إيميل تقديم على وظيفة", "رتب لي خطة عمل أسبوعية"],
      };
    }

    return {
      toolName: "structured_drafter",
      titleAr: "قالب بريد إلكتروني رسمي",
      topicTag: "draft_email",
      reply:
        `### مسودة بريد إلكتروني احترافي\n\n` +
        "**الموضوع:** [عنوان واضح ومباشر للموضوع]\n\n" +
        "السلام عليكم ورحمة الله وبركاته،\n\n" +
        "الأستاذ/ة [اسم المستلم] المحترم/ة،\n\n" +
        "أتمنى أن تكونوا بخير. أراسلكم بخصوص **[موضوع الرسالة في جملة واحدة]**، وأود مشاركة النقاط التالية:\n" +
        "- **النقطة الأولى:** [الهدف أو المستجدات الحالية].\n" +
        "- **الإجراء المقترح:** [الخطوة التالية أو المطلوب مراجعته].\n" +
        "- **الموعد المقترح:** [اليوم والتوقيت].\n\n" +
        "يسعدني تلقي ردكم وملاحظاتكم في أقرب وقت مناسب.\n\n" +
        "مع خالص التحية،\n**[اسمك] · [المسمى الوظيفي]**",
      suggestions: ["اكتب خطة مذاكرة يومية", "اكتب إيميل تقديم على وظيفة"],
    };
  }

  if (/(خطه|خطة|جدول مذاكره|جدول اسبوعي|خطة عمل|خطة مشروع|roadmap|study plan)/i.test(normText)) {
    const isStudy = /(مذاكر|دراسه|امتحان|تعلم|انجليزي|برمجه)/i.test(normText);
    if (isStudy) {
      return {
        toolName: "structured_drafter",
        titleAr: "خطة مذاكرة عملية متوازنة",
        topicTag: "time_management_study",
        reply:
          `### خطة مذاكرة مركّزة بنظام الكتل الزمنية (Pomodoro)\n\n` +
          "| الفترة | النشاط | المدة | الهدف |\n" +
          "| --- | --- | --- | --- |\n" +
          "| الكتلة 1 | أصعب مادة أو مفهوم جديد | 50 دقيقة | استيعاب الفكرة الأساسية بدون تشتت |\n" +
          "| استراحة قصيرة | حركة خفيفة وشرب ماء (دون تصفح الهاتف) | 10 دقائق | تجديد التركيز |\n" +
          "| الكتلة 2 | تطبيق عملي / حل مسائل أو كود | 50 دقيقة | تثبيت الفهم بالحل الفعلي |\n" +
          "| المراجعة المسائية | تلخيص 3 نقاط رئيسية بالورقة والقلم | 20 دقيقة | منع النسيان في اليوم التالي |\n\n" +
          "**قاعدة الاستمرار:** خصص 15 دقيقة نهاية الأسبوع لمراجعة ما أُنجز وتعديل جدول الأسبوع القادم فقط.",
        suggestions: ["نصائح علاج التسويف وتنظيم الوقت", "كيف أبدأ تعلم البرمجة من الصفر؟"],
      };
    }

    return {
      toolName: "structured_drafter",
      titleAr: "خطة تنفيذ مشروع في 4 مراحل",
      topicTag: "startup_idea_saas",
      reply:
        `### خطة عمل تنفيذية من 4 مراحل (من الفكرة إلى الإطلاق)\n\n` +
        "1. **الأسبوع 1 — التحديد والتحقق:** صياغة المشكلة في جملة، تحديد أهم 3 ميزات فقط للنسخة الأولية (MVP)، واختيار التقنيات.\n" +
        "2. **الأسبوع 2 — البناء الأساسي:** تجهيز قاعدة البيانات، واجهات API الأساسية، وهيكل الواجهة الرئيسية.\n" +
        "3. **الأسبوع 3 — التكامل والفحص:** ربط المكونات، فحص الأخطاء والأمان، واختبار الأداء على الهاتف وسطح المكتب.\n" +
        "4. **الأسبوع 4 — الإطلاق وجمع الملاحظات:** نشر النسخة الأولى لعدد محدود من المستخدمين وتحسين أهم نقطة احتكاك لديهم.",
      suggestions: ["كيف أبني مشروع تقني ناجح (MVP)؟", "اكتب دالة TypeScript لإدارة المهام"],
    };
  }

  return null;
}
