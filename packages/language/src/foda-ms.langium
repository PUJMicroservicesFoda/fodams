grammar FodaMs

entry Model:
    domain=DomainSection
    qualityAttributes=QualityAttributesSection
    tree=FeatureTree
    hardConstraints=HardConstraintSection
    tradeOffs=TradeOffSection
    evidenceDeclarations=EvidencesSection?
    configuration=Configuration;

DomainSection:
    'domain' '{'
        domains+=DomainItem*
    '}';

DomainItem:
    name=ID ';';

QualityAttributesSection:
    'qualityAttributes' '{'
        declarations+=QualityAttributeDeclaration*
    '}';

QualityAttributeDeclaration:
    'quality' name=ID (direction=Direction)? ';';

Direction:
    kind=DirectionKind 'is' 'better';

DirectionKind returns string:
    'higher' | 'lower';

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
    (
        '{'
            ('domain' '=' ('[' domainValue+=[DomainItem:ID] (',' domainValue+=[DomainItem:ID])* ']' | domainValue+=[DomainItem:ID]) ';')?
            ('evidence' '=' ('[' (evidence+=EvidenceRef (',' evidence+=EvidenceRef)*)? ']' | evidence+=EvidenceRef) ';')?
        '}'
    |
        ';'
    );

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
    (
        '{'
            ('domain' '=' ('[' domainValue+=[DomainItem:ID] (',' domainValue+=[DomainItem:ID])* ']' | domainValue+=[DomainItem:ID]) ';')?
            ('strength' '=' strength=TradeOffStrength ';')?
            ('evidence' '=' ('[' (evidence+=EvidenceRef (',' evidence+=EvidenceRef)*)? ']' | evidence+=EvidenceRef) ';')?
        '}'
    |
        ';'
    );

EvidenceRef:
    evidence=[EvidencesDeclaration:ID];

EvidencesSection:
    'evidences' '{'
        declarations+=EvidencesDeclaration*
    '}';

EvidencesDeclaration:
    name=ID ';';

TradeOffKind returns string:
    'increases' | 'reduces';

TradeOffStrength returns string:
    'low' | 'medium' | 'high';

Configuration:
    'configuration' '{'
        ('domain' '=' domainSelection=[DomainItem:ID] ';')?
        priorityGroups+=PriorityGroup+
    '}';

PriorityGroup:
    'priority' label=ID '{' (selected+=[QualityAttributeDeclaration:ID] ';')* '}';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\-\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
