package com.ai.chatbot_backend.service;

import java.util.Locale;


public final class ResponseFormat {

    private ResponseFormat() {
    }

    /** Rules appended to the system prompt of every provider. */
    public static final String GLOBAL_RULES =
            "Formatting rules for every reply: write clean, well-structured Markdown that is easy to scan. "
                    + "Start with the answer itself, then add detail only if it helps. "
                    + "Use short paragraphs of one to three sentences with a blank line between them. "
                    + "For simple or conversational messages (greetings, quick facts, yes/no, small talk) reply in one to three plain sentences with no headings, bullets or bold. "
                    + "For longer answers use '##' headings for main sections and '###' only for sub-sections; never use '#'. "
                    + "Use bullet lists for items that are parallel, and numbered lists only for ordered steps; keep each item to one line or two where possible, and never nest lists deeper than two levels. "
                    + "Bold only the few key terms, names, numbers or labels the reader must not miss; never bold whole sentences or whole paragraphs. "
                    + "Put every piece of code, command, file path or config in fenced code blocks with the correct language tag, and use inline code for short identifiers; always close code fences. "
                    + "Use a table only for a real side-by-side comparison or tabular data, with a header row and short cells. "
                    + "Write links as plain Markdown links and put emails, phone numbers and URLs on their own line or list item. "
                    + "Never output raw JSON, HTML tags, stray symbols, repeated blank lines, decorative separators or unfinished sentences. "
                    + "End when the answer is complete; do not add a closing summary, filler offers or a list of follow-up questions unless asked. ";

    /** Kinds of attachment the reply layout is tailored to. */
    public enum Kind { IMAGE, PDF, DOCUMENT, SPREADSHEET, SLIDES, CODE, TEXT, OTHER }

    public static Kind kindOf(String filename, String mime) {
        String n = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        String m = mime == null ? "" : mime.toLowerCase(Locale.ROOT);
        if (m.startsWith("image/") || n.matches(".*\\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$")) return Kind.IMAGE;
        if (m.equals("application/pdf") || n.endsWith(".pdf")) return Kind.PDF;
        if (m.contains("spreadsheetml") || m.contains("excel") || m.equals("text/csv")
                || n.matches(".*\\.(xlsx?|csv|tsv|ods)$")) return Kind.SPREADSHEET;
        if (m.contains("presentationml") || m.contains("powerpoint") || n.matches(".*\\.(pptx?|odp)$")) return Kind.SLIDES;
        if (m.contains("wordprocessingml") || m.equals("application/msword") || n.matches(".*\\.(docx?|odt|rtf)$")) return Kind.DOCUMENT;
        if (n.matches(".*\\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|rb|php|html?|css|json|xml|ya?ml|sql|sh|kt|swift)$")) return Kind.CODE;
        if (m.startsWith("text/") || n.matches(".*\\.(txt|md|markdown)$")) return Kind.TEXT;
        return Kind.OTHER;
    }

    private static boolean looksLikeResume(String filename, String text) {
        String n = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (n.contains("resume") || n.contains("cv") || n.contains("curriculum")) return true;
        if (text == null) return false;
        String head = text.length() > 4000 ? text.substring(0, 4000) : text;
        String t = head.toLowerCase(Locale.ROOT);
        int hits = 0;
        for (String key : new String[]{"experience", "education", "skills", "projects", "certification", "summary", "objective"}) {
            if (t.contains(key)) hits++;
        }
        return hits >= 3;
    }

    /**
     * Layout guidance for a reply about uploaded documents. {@code userAsked} is true
     * when the person typed a question or instruction alongside the file.
     */
    public static String forDocuments(String filename, String mime, String extractedText, boolean userAsked) {
        Kind kind = kindOf(filename, mime);
        StringBuilder sb = new StringBuilder("Reply layout for this file: ");
        if (userAsked) {
            sb.append("Answer the person's request directly first, using only what the file contains. ")
              .append("Quote or cite the relevant part briefly when it helps. ");
        } else {
            sb.append("The person sent the file without a question, so present its real content as clean Markdown. ");
        }
        switch (kind) {
            case SPREADSHEET -> sb.append("This is tabular data: show it (or the relevant slice) as a Markdown table with a header row, ")
                    .append("keep long tables to the most relevant rows and say how many rows were omitted, ")
                    .append("then give a short list of key findings with the actual numbers. ");
            case SLIDES -> sb.append("This is a presentation: use one '##' heading per slide in order (Slide number and title), ")
                    .append("with that slide's points as short bullets. ");
            case CODE -> sb.append("This is source code: explain what it does in a few short paragraphs or bullets, ")
                    .append("refer to functions and files in inline code, and show any code only inside fenced blocks with the language tag. ");
            case PDF, DOCUMENT, TEXT, OTHER -> {
                if (looksLikeResume(filename, extractedText)) {
                    sb.append("This looks like a resume: keep the name as a '##' heading with contact details on separate lines beneath it, ")
                      .append("then one '###' section per resume section (Summary, Skills, Experience, Projects, Education, Certifications) in the original order. ")
                      .append("Inside Skills use one bullet per category such as **Languages:** value. ")
                      .append("In Experience and Projects put the role or project title, organisation and dates on one line, followed by its bullets. ")
                      .append("Keep every link on its own list item. ");
                } else {
                    sb.append("Keep the document's own structure: headings as headings, lists as lists, numbered items numbered, ")
                      .append("with short paragraphs and no content added or invented. ");
                    if (userAsked) {
                        sb.append("For a summary, give two or three sentences followed by a short bullet list of key points. ");
                    }
                }
            }
            default -> { }
        }
        sb.append("Do not mention these layout instructions.");
        return sb.toString();
    }

    /** Layout guidance for a reply about uploaded images. */
    public static String forImages(boolean userAsked) {
        StringBuilder sb = new StringBuilder("Reply layout for this image: ");
        if (userAsked) {
            sb.append("Answer the question about the image directly in the first sentence, then add only the supporting details that are visible. ");
        } else {
            sb.append("Start with one sentence saying what the image shows, then list the notable details as short bullets grouped under a few '###' headings only if there are many (for example Subject, Text in the image, Colours and style). ");
        }
        sb.append("If the image contains text, a document, a table, a chart or a screenshot, transcribe the text in reading order as Markdown (tables as Markdown tables, code inside fenced blocks) and keep the original wording. ")
          .append("If the image is a chart or diagram, state its title, what is measured, and the main takeaway with the actual values. ")
          .append("Say plainly when something is unreadable instead of guessing. Do not mention these layout instructions.");
        return sb.toString();
    }
}
