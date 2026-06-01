grammar FodaMs

entry Model:
    qualityAttributes=QualityAttributesSection
    tree=FeatureTree
    hardConstraints=HardConstraintSection
    tradeOffs=TradeOffSection
    configuration=Configuration;

QualityAttributesSection:
    'qualityAttributes' '{'
        declarations+=QualityAttributeDeclaration*
    '}';

QualityAttributeDeclaration:
    'quality' name=ID ';';

FeatureTree:
    'featureTree' root=ID '{' relations+=ChildRelation* '}' ';'?;

FeatureNode:
    feature=[QualityAttributeDeclaration:ID]
    ('{' relations+=ChildRelation* '}')?;

ChildRelation:
    MandatoryRelation | OptionalRelation | OrRelation | AlternativeRelation;

MandatoryRelation:
    'mandatory' child=FeatureNode ';';

OptionalRelation:
    'optional' child=FeatureNode ';';

OrRelation:
    'or' '{' children+=FeatureNode (',' children+=FeatureNode)* '}' ';';

AlternativeRelation:
    'alternative' '{' children+=FeatureNode (',' children+=FeatureNode)* '}' ';';

HardConstraintSection:
    'constraints' '{'
        constraints+=HardConstraint*
    '}';

HardConstraint:
    left=[QualityAttributeDeclaration:ID]
    relation=HardConstraintKind
    right=[QualityAttributeDeclaration:ID]
    ';';

HardConstraintKind returns string:
    'requires' | 'excludes';

TradeOffSection:
    'tradeOffs' '{'
        relations+=TradeOffRelation*
    '}';

TradeOffRelation:
    left=[QualityAttributeDeclaration:ID]
    relation=TradeOffKind
    right=[QualityAttributeDeclaration:ID]
    ('strength' strength=TradeOffStrength)?
    ';';

TradeOffKind returns string:
    'increases' | 'reduces' | 'moreImportantThan';

TradeOffStrength returns string:
    'weak' | 'medium' | 'strong';

Configuration:
    'configuration' '{'
        priorityGroups+=PriorityGroup+
    '}';

PriorityGroup:
    'priorityGroup' '{' selected+=[QualityAttributeDeclaration:ID] (',' selected+=[QualityAttributeDeclaration:ID])* '}' ';';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
