Ext.define('Ext.ux.form.field.Tree', {
    extend: 'Ext.form.FieldContainer',

    mixins: [
        'Ext.form.field.Field'
    ],

    alternateClassName: 'Ext.ux.TreeField',
    alias: ['widget.treefield', 'widget.treeformfield'],

    requires: ['Ext.tree.Panel', 'Ext.layout.container.Fit'],

    layout: {
        type: 'fit'
    },

    valueProperty: 'text', //the property name from the records which keeps the component values
    delimiter: ',', //default delimiter for the submit value

    allowBlank: true,
    minSelections: 0,
    maxSelections: Number.MAX_VALUE,
    blankText: 'This field is required',
    minSelectionsText: 'Minimum {0} item(s) are required',
    maxSelectionsText: 'Maximum {0} item(s) are allowed',
    treeConfig: {},

    initComponent: function () {
        var me = this;

        me.handleStoreConfig();

        me.items = me.createTreePanel();

        me.callParent();
        me.initField();
    },

    //quick check of the store/root configuration
    handleStoreConfig: function () {
        var me = this;

        if (Ext.isEmpty(me.store)) {
            if (Ext.isEmpty(me.root)) {
                Ext.Logger.warn('[Ext.ux.form.field.Tree]: This component needs a treestore instance, treestore config or root config');
            }
        } else {
            if (!Ext.isEmpty(me.root)) {
                delete me.root;
            }
        }
    },

    //create tree-panel and set some listeners
    createTreePanel: function () {
        var me = this;

        var treeCfg = Ext.apply({
            store: me.store,
            root: me.root
        }, me.treeConfig);

        var tree = Ext.widget('treepanel', treeCfg);
        me.tree = tree;

        tree.getStore().on({
            load: {
                fn: me.onStoreLoad,
                scope: me
            }
        });

        tree.on({
            afterrender: me.onTreeRender,
            checkchange: {
                fn: me.onTreeCheckChange,
                scope: me,
                buffer: 10 //prevent the handler to be executed many times due to checkPropagation
            }
        });

        return [tree];
    },

    //store load handler
    onStoreLoad: function () {
        var me = this;
        me.decorateTreeNodes('storeload');
    },

    //treepanel afterrender handler
    onTreeRender: function () {
        var me = this.ownerCt; //the scope is the treepanel, not the fieldcontainer itself

        me.decorateTreeNodes('render'); //we need to check for the 'check' property presence because the store passed could be already loaded
    },

    //checkchange handler
    onTreeCheckChange: function (node) {
        var me = this;
        me.setValue(me.getCheckedNodes());
    },

    //applies the 'checked: false' property to nodes if it is missing from the data or is set to something other than false
    decorateTreeNodes: function (frm) {
        var me = this,
            tree = me.tree;
        //console.log(frm + ': decorating tree...');

        tree.getRootNode().cascade( // it should be cascadeBy prior to 6.2.0.981
            (node) => {
                /*if (Ext.isEmpty(node.get('checked'))) {
                    node.set('checked', false);
                }*/
                node.set('checked', false);
            }
        );
    },

    //returns an array with the values of the 'valueProperty' of checked nodes
    getCheckedNodes: function () {
        var me = this;

        var ids = [];
        //console.log('getting checked nodes...');

        ids = Ext.Array.pluck(me.tree.getChecked(), 'data');
        ids = Ext.Array.pluck(ids, me.valueProperty);

        //return ids.join(',');
        return ids;
    },

    //based on the current value - set checked to true/false for each tree node
    setCheckedNodes: function (value) {
        var me = this,
            tree = me.tree;

        //console.log('checking nodes according to value...');

        tree.getRootNode().cascade( // it should be cascadeBy prior to 6.2.0.981
            (node) => {
                node.set('checked', value.includes(node.get(me.valueProperty)));
            }
        );
    },


    //----------------------------------------------------------------------
    // VALUE Getter/Setter methods
    //----------------------------------------------------------------------
    setValue: function (value) {
        var me = this,
            store = me.tree.getStore();

        //console.log('setting field value...');

        var minStoreCount = me.tree.rootVisible ? 2 : 1;

        //console.log('store count: ' + store.getCount());

        if (store.getCount() < minStoreCount) {
            //console.log('store not loaded, delaying value setting...');
            store.on({
                load: Ext.Function.bind(me.setValue, me, [value]),
                single: true
            });

            return;
        }

        //value = me.setupValue(value);
        me.mixins.field.setValue.call(me, value);

        if (!me.tree.rendered) {
            //console.log('tree not rendered yet, delaying tree checkboxes update...');
            me.tree.on({
                afterrender: Ext.Function.bind(me.setCheckedNodes, me, [value]),
                single: true
            });
        } else {
            me.setCheckedNodes(value);
        }

        //console.log('VALUE IS: ' + me.getValue());
        //console.log('SUBMIT VALUE IS: ' + me.getSubmitValue());

    },

    getValue: function () {
        var me = this;
        return me.value || [];
    },

    getSubmitValue: function () {
        var me = this;
        return me.value ? me.value.join(me.delimiter) : '';
    },


    //----------------------------------------------------------------------
    // VALIDATION and ERROR methods
    //----------------------------------------------------------------------
    getErrors: function (value) {
        var me = this,
            format = Ext.String.format,
            errors = [],
            numSelected;

        value = Ext.Array.from(value || me.getValue());
        numSelected = value.length;

        if (!me.allowBlank && numSelected < 1) {
            errors.push(me.blankText);
        }

        if (numSelected < me.minSelections) {
            errors.push(format(me.minSelectionsText, me.minSelections));
        }

        if (numSelected > me.maxSelections) {
            errors.push(format(me.maxSelectionsText, me.maxSelections));
        }

        return errors;
    },

    markInvalid: function (errors) {
        var me = this,
            oldMsg = me.getActiveError();

        me.setActiveErrors(Ext.Array.from(errors));

        if (oldMsg !== me.getActiveError()) {
            me.updateLayout();
        }
    },

    clearInvalid: function () {
        var me = this,
            hadError = me.hasActiveError();

        me.unsetActiveError();

        if (hadError) {
            me.updateLayout();
        }
    },

    isValid: function () {
        var me = this,
            disabled = me.disabled,
            //validate = me.forceValidation || !disabled;
            validate = !disabled;

        return validate ? me.validateValue(me.value) : disabled;
    },

    validateValue: function (value) {
        var me = this,
            errors = me.getErrors(value),
            isValid = Ext.isEmpty(errors);

        if (!me.preventMark) {
            if (isValid) {
                me.clearInvalid();
            } else {
                me.markInvalid(errors);
            }
        }

        return isValid;
    }

});