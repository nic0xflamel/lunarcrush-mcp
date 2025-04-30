import Mustache from 'mustache';
export function renderAuthTemplate(template, context) {
    // Disable HTML escaping for URLs
    Mustache.escape = (text) => text;
    // Render URL with template variables
    const renderedUrl = Mustache.render(template.url, context);
    // Create a new template object with rendered values
    const renderedTemplate = {
        ...template,
        url: renderedUrl,
        headers: { ...template.headers }, // Create a new headers object to avoid modifying the original
    };
    // Render body if it exists
    if (template.body) {
        renderedTemplate.body = Mustache.render(template.body, context);
    }
    return renderedTemplate;
}
//# sourceMappingURL=template.js.map