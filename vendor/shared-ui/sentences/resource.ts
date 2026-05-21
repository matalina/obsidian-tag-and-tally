import resourcesData from "../data/constants/resources.json";

interface ResourceData {
    name: string;
    rarity: string;
    descriptor: string;
    resourceType: string;
    special: string;
}

// Flatten all resources from all categories into a single array
function getAllResources(): ResourceData[] {
    const allResources: ResourceData[] = [];
    
    // Add all resource categories
    const categories = [
        resourcesData.essenceResources,
        resourcesData.organicCreatureParts,
        resourcesData.glandFluidCreatureParts,
        resourcesData.constructCreatureParts,
        resourcesData.magicalCreatureParts,
        resourcesData.plantCreatureParts,
        resourcesData.oreResources,
        resourcesData.woodResources,
        resourcesData.fiberResources,
        resourcesData.liquidResources,
        resourcesData.plantResources,
    ];
    
    for (const category of categories) {
        for (const resource of Object.values(category)) {
            allResources.push(resource as ResourceData);
        }
    }
    
    return allResources;
}

export function generateResourceSentence(
    _theme?: string,
    _locationType?: string
): string {
    const allResources = getAllResources();
    
    // Randomly select a resource
    const randomIndex = Math.floor(Math.random() * allResources.length);
    const resource = allResources[randomIndex];
    
    // Format the sentence: **Name** is a [rarity] [descriptor] [resourceType] that [special].
    // Note: rarity should be lowercase in brackets, descriptor and special should be lowercase in brackets
    const rarity = resource.rarity.toLowerCase();
    const descriptor = resource.descriptor.toLowerCase();
    const resourceType = resource.resourceType;
    const special = resource.special.toLowerCase();
    
    let result = `**${resource.name}** is a [${rarity}] [${descriptor}] [${resourceType}] that [${special}].`;
    
    // Convert markdown to HTML for display (same as generateSentence in utils.ts)
    // Convert **bold** to <strong>bold</strong> (non-greedy to handle multiple bold sections)
    result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // Convert _italic_ to <em>italic</em>
    result = result.replace(/_([^_]+?)_/g, '<em>$1</em>');
    
    return result;
}

export function generateResourceSentenceWithTags(
    _theme?: string,
    _locationType?: string
): string {
    const allResources = getAllResources();
    
    // Randomly select a resource
    const randomIndex = Math.floor(Math.random() * allResources.length);
    const resource = allResources[randomIndex];
    
    const rarity = resource.rarity.toLowerCase();
    const descriptor = resource.descriptor.toLowerCase();
    const resourceType = resource.resourceType.toLowerCase();
    const special = resource.special.toLowerCase();
    
    let result = `**${resource.name}** is a [${rarity}] [${descriptor}] [${resourceType}] that [${special}].`;
    
    // Return plain text (not HTML) - preserve markdown formatting like **bold**
    return result;
}
